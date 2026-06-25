import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { getCurrentHoldPlacePlayInfo, holdPlace, releaseHoldPlace, setHoldPlacePlay } from "../stores";
import { AkashicSystemClient, loadAkashicSystemConfig } from "../services/akashicSystem";
import { buildAkashicGameCode, DEFAULT_SCRAMBLE_PLAY_CONTENT, resolvePlayContentInfo } from "../services/playContent";

interface IdParams {
	authorization: string;
	id: string;
}

export class PlacesController extends BaseController {
	register(basePath: string): Router {
		const router = super.register(basePath);
		this.registerRoute(router, "POST", "/:id/hold", this.hold, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		]);

		this.registerRoute(router, "POST", "/:id/release", this.release, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		]);

		this.registerRoute(router, "POST", "/:id/play/start", this.startPlay, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
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
		if (endedHoldPlace?.currentPlayId) {
			await this.stopAkashicPlayIfConfigured(endedHoldPlace.currentPlayId);
		}
		return { result: "ok" };
	}

	async startPlay(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const config = loadAkashicSystemConfig();
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
				gameCode: buildAkashicGameCode(target.holdPlaceId, content.contentCode),
				gameTitle: content.title,
				gameDescription: content.description,
				contentUrl: content.contentUrl,
				inputAdapter: content.inputAdapter,
				expireAt: target.expireAt?.toDate().toISOString(),
				joinPath: `/play/${encodeURIComponent(target.holdPlaceId)}`,
			};
		}

		const content = DEFAULT_SCRAMBLE_PLAY_CONTENT;
		const system = new AkashicSystemClient(config);
		const gameCode = buildAkashicGameCode(target.holdPlaceId, content.contentCode);
		const createdPlay = await system.createPlay(gameCode);
		let storedPlay;
		try {
			storedPlay = await setHoldPlacePlay(this.app.firestore, {
				holdPlaceId: target.holdPlaceId,
				holdUserId: verifyResult.uid,
				systemPlayId: createdPlay.id,
				providerId: content.providerId,
				contentCode: content.contentCode,
				contentUrl: content.contentUrl,
				ownerUserId: verifyResult.uid,
			});

			if (storedPlay.currentPlayId !== createdPlay.id) {
				await system.stopPlay(createdPlay.id);
			}
		} catch (error) {
			await system.stopPlay(createdPlay.id);
			throw error;
		}

		const storedContent = await resolvePlayContentInfo(storedPlay);
		return {
			holdPlaceId: storedPlay.holdPlaceId,
			placeId: storedPlay.placeId,
			playId: storedPlay.currentPlayId,
			gameCode: buildAkashicGameCode(storedPlay.holdPlaceId, storedContent.contentCode),
			gameTitle: storedContent.title,
			gameDescription: storedContent.description,
			contentUrl: storedContent.contentUrl,
			inputAdapter: storedContent.inputAdapter,
			expireAt: storedPlay.expireAt?.toDate().toISOString(),
			joinPath: `/play/${encodeURIComponent(storedPlay.holdPlaceId)}`,
		};
	}

	private async stopAkashicPlayIfConfigured(playId: string) {
		if (!process.env.AKASHIC_SYSTEM_API_KEY) return;
		try {
			await new AkashicSystemClient().stopPlay(playId);
		} catch (error) {
			console.warn(error);
		}
	}
}
