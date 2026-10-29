import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { holdPlace, releaseHoldPlace, releasePlaySlot, reservePlaySlot, setHoldPlacePlay } from "../stores";
import { getCurrentHoldPlacePlayInfo, HoldPlacePlayInfo } from "../resolvers/holdPlaces";
import { AkashicSystemRegistry, loadAkashicSystemSettings } from "../services/akashicSystem";
import { buildAkashicGameCode, DEFAULT_SCRAMBLE_PLAY_CONTENT, resolvePlayContentInfo } from "../services/playContent";

// 未設定の場合は上限なしとし、枠の数だけを数える。
function loadPlayLimit() {
	const value = process.env.SCRAMBLE_PLAY_LIMIT?.trim();
	if (!value) return undefined;
	if (!/^\d+$/.test(value)) {
		throw new fw.types.InternalServerError("SCRAMBLE_PLAY_LIMIT is invalid.");
	}
	return Number(value);
}

interface IdParams {
	authorization: string;
	id: string;
}

export class PlacesController extends BaseController {
	register(basePath: string): Router {
		const router = super.register(basePath);
		this.registerRoute(router, "POST", "/:id/hold", this.hold, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators
						.param("id")
						.isString()
						.notEmpty()
						.matches(/^[^/]+$/),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		]);

		this.registerRoute(router, "POST", "/:id/release", this.release, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators
						.param("id")
						.isString()
						.notEmpty()
						.matches(/^[^/]+$/),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		]);

		this.registerRoute(router, "POST", "/:id/play/start", this.startPlay, [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators
						.param("id")
						.isString()
						.notEmpty()
						.matches(/^[^/]+$/),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		]);

		return router;
	}

	async hold(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const holdPlaceId = await holdPlace(this.app.firestore, {
			placeId: p.id,
			holdUserId: verifyResult.uid,
		});
		return { holdPlaceId };
	}

	async release(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const endedHoldPlace = await releaseHoldPlace(this.app.firestore, {
			placeId: p.id,
			holdUserId: verifyResult.uid,
		});
		if (endedHoldPlace?.akashicPlayId) {
			await this.stopAkashicPlayIfConfigured(endedHoldPlace);
		}
		return { result: "ok" };
	}

	async startPlay(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const settings = loadAkashicSystemSettings();
		const target = await getCurrentHoldPlacePlayInfo(this.app.firestore, {
			placeId: p.id,
			holdUserId: verifyResult.uid,
			requireOwner: true,
		});
		if (target.currentPlayId) {
			const content = await resolvePlayContentInfo(target);
			return {
				holdPlaceId: target.holdPlaceId,
				placeId: target.placeId,
				playId: target.currentPlayId,
				gameTitle: content.title,
				gameDescription: content.description,
				contentUrl: content.contentUrl,
				expireAt: target.expireAt?.toDate().toISOString(),
				joinPath: `/play/${encodeURIComponent(target.holdPlaceId)}`,
			};
		}

		const content = DEFAULT_SCRAMBLE_PLAY_CONTENT;
		// 外部Playを作る前に枠を確保し、同時開始でも上限を超えないようにする。
		const reserved = await reservePlaySlot(this.app.firestore, {
			holdPlaceId: target.holdPlaceId,
			holdUserId: verifyResult.uid,
			limit: loadPlayLimit(),
		});
		let storedPlay;
		try {
			const system = await new AkashicSystemRegistry(settings).chooseClientByRunningPlayCount();
			const gameCode = buildAkashicGameCode(target.holdPlaceId, content.contentCode);
			const createdPlay = await system.createPlay(gameCode);
			try {
				storedPlay = await setHoldPlacePlay(this.app.firestore, {
					holdPlaceId: target.holdPlaceId,
					holdUserId: verifyResult.uid,
					akashicPlayId: createdPlay.id,
					systemUrl: system.config.apiBaseUrl,
					providerId: content.providerId,
					contentCode: content.contentCode,
					contentUrl: content.contentUrl,
					ownerUserId: verifyResult.uid,
				});

				// 同時開始で別のPlayが採用された場合、自分が作成した未採用のPlayを残さない。
				if (storedPlay.akashicPlayId !== createdPlay.id || storedPlay.systemUrl !== system.config.apiBaseUrl) {
					await system.stopPlay(createdPlay.id);
				}
			} catch (error) {
				// Firestoreへの登録に失敗した場合も、先に作成した外部Playを補償的に停止する。
				await system.stopPlay(createdPlay.id);
				throw error;
			}
		} catch (error) {
			// Playを登録できなかった場合、自分が確保した枠を解放する。
			if (reserved) {
				try {
					await releasePlaySlot(this.app.firestore, { holdPlaceId: target.holdPlaceId });
				} catch (releaseError) {
					console.warn(releaseError);
				}
			}
			throw error;
		}

		const storedContent = await resolvePlayContentInfo(storedPlay);
		return {
			holdPlaceId: storedPlay.holdPlaceId,
			placeId: storedPlay.placeId,
			playId: storedPlay.currentPlayId,
			gameTitle: storedContent.title,
			gameDescription: storedContent.description,
			contentUrl: storedContent.contentUrl,
			expireAt: storedPlay.expireAt?.toDate().toISOString(),
			joinPath: `/play/${encodeURIComponent(storedPlay.holdPlaceId)}`,
		};
	}

	private async stopAkashicPlayIfConfigured(playInfo: Pick<HoldPlacePlayInfo, "akashicPlayId" | "systemUrl">) {
		if (!process.env.AKASHIC_SYSTEM_API_KEY || !playInfo.akashicPlayId) return;
		try {
			const registry = new AkashicSystemRegistry(loadAkashicSystemSettings());
			await registry.getClientForPlay(playInfo.systemUrl).stopPlay(playInfo.akashicPlayId);
		} catch (error) {
			console.warn(error);
		}
	}
}
