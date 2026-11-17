import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { holdPlace, releaseHoldPlace, releasePlaySlot, reservePlaySlot, setHoldPlacePlay } from "../stores";
import { getCurrentHoldPlacePlayInfo, HoldPlacePlayInfo } from "../resolvers/holdPlaces";
import { AkashicSystemRegistry, loadAkashicSystemSettings } from "../services/akashicSystem";
import { buildAkashicGameCode, DEFAULT_SCRAMBLE_PLAY_CONTENT, resolvePlayContentInfo } from "../services/playContent";

// Play開始APIのレスポンスを、Playが登録済みのHoldPlaceの情報から作る。
async function buildStartPlayResult(playInfo: HoldPlacePlayInfo) {
	const content = await resolvePlayContentInfo(playInfo);
	return {
		holdPlaceId: playInfo.holdPlaceId,
		placeId: playInfo.placeId,
		playId: playInfo.currentPlayId,
		gameTitle: content.title,
		gameDescription: content.description,
		contentUrl: content.contentUrl,
		expireAt: playInfo.expireAt?.toDate().toISOString(),
		joinPath: `/play/${encodeURIComponent(playInfo.holdPlaceId)}`,
	};
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
			now: Timestamp.now(),
		});
		return { holdPlaceId };
	}

	async release(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const endedHoldPlace = await releaseHoldPlace(this.app.firestore, {
			placeId: p.id,
			holdUserId: verifyResult.uid,
			now: Timestamp.now(),
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
			return buildStartPlayResult(target);
		}

		const content = DEFAULT_SCRAMBLE_PLAY_CONTENT;
		// 外部Playを作る前に枠を確保し、同時開始でも上限を超えないようにする。
		const reserved = await reservePlaySlot(this.app.firestore, {
			holdPlaceId: target.holdPlaceId,
			holdUserId: verifyResult.uid,
			now: Timestamp.now(),
		});
		if (!reserved) {
			// 枠の確保までの間に別のリクエストがPlayを登録していた場合は、そのPlayを返す。
			const current = await getCurrentHoldPlacePlayInfo(this.app.firestore, {
				placeId: p.id,
				holdUserId: verifyResult.uid,
				requireOwner: true,
			});
			return buildStartPlayResult(current);
		}

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
					now: Timestamp.now(),
				});

				// 枠を確保しているので、通常は自分が作成したPlayが登録される。
				// 念のため、登録されたPlayが自分の作成したものと違う場合は、自分が作成したPlayを残さないよう停止する。
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
			try {
				await releasePlaySlot(this.app.firestore, { holdPlaceId: target.holdPlaceId, now: Timestamp.now() });
			} catch (releaseError) {
				console.warn(releaseError);
			}
			throw error;
		}

		return buildStartPlayResult(storedPlay);
	}

	async stopAkashicPlayIfConfigured(playInfo: Pick<HoldPlacePlayInfo, "akashicPlayId" | "systemUrl">) {
		if (!process.env.AKASHIC_SYSTEM_API_KEY || !playInfo.akashicPlayId) return;
		try {
			const registry = new AkashicSystemRegistry(loadAkashicSystemSettings());
			await registry.getClientForPlay(playInfo.systemUrl).stopPlay(playInfo.akashicPlayId);
		} catch (error) {
			console.warn(error);
		}
	}
}
