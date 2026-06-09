import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { clearHoldPlacePlay, getHoldPlacePlayInfo } from "../stores";
import { AkashicExecutionMode, AkashicSystemClient, loadAkashicSystemConfig } from "../services/akashicSystem";

interface IdParams {
	authorization: string;
	id: string;
}

export class HoldPlacesController extends BaseController {
	register(basePath: string): Router {
		const router = super.register(basePath);

		this.registerRoute(router, "POST", "/:id/play/launch", this.launchPlay, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		]);

		this.registerRoute(router, "POST", "/:id/play/end", this.endPlay, [
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

	async launchPlay(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const playInfo = await getHoldPlacePlayInfo(this.app.firestore, {
			holdPlaceId: p.id,
		});
		const config = loadAkashicSystemConfig();
		const mode: AkashicExecutionMode = playInfo.activeUserId === verifyResult.uid ? "active" : "passive";
		const userId = `scramble-${verifyResult.uid}`;
		const token = await new AkashicSystemClient(config).createToken(playInfo.currentPlayId!, userId, mode);

		return {
			holdPlaceId: playInfo.holdPlaceId,
			placeId: playInfo.placeId,
			playId: playInfo.currentPlayId,
			mode,
			userId,
			gameCode: playInfo.currentPlayGameCode ?? config.defaultGameCode,
			gameTitle: playInfo.currentPlayTitle ?? config.defaultGameTitle,
			gameDescription: playInfo.currentPlayDescription ?? config.defaultGameDescription,
			contentUrl: playInfo.currentPlayContentUrl ?? config.defaultContentUrl,
			inputAdapter: playInfo.currentPlayInputAdapter ?? config.defaultInputAdapter,
			expireAt: playInfo.expireAt?.toDate().toISOString(),
			playToken: token.value,
			playlogServerUrl: token.url,
			gamePageUrl: config.gamePageUrl,
		};
	}

	async endPlay(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const playInfo = await clearHoldPlacePlay(this.app.firestore, {
			holdPlaceId: p.id,
			holdUserId: verifyResult.uid,
			requireOwner: true,
		});
		if (playInfo.currentPlayId) {
			await new AkashicSystemClient().stopPlay(playInfo.currentPlayId);
		}
		return {
			result: "ok",
			holdPlaceId: playInfo.holdPlaceId,
			placeId: playInfo.placeId,
			playId: playInfo.currentPlayId,
		};
	}
}
