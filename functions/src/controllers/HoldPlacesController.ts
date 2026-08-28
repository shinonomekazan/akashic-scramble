import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { clearHoldPlacePlay } from "../stores";
import { getHoldPlacePlayInfo, HoldPlacePlayInfo } from "../resolvers/holdPlaces";
import {
	AkashicExecutionMode,
	AkashicSystemRegistry,
	loadAkashicSystemSettings,
} from "../services/akashicSystem";
import { resolvePlayContentInfo } from "../services/playContent";

interface IdParams {
	authorization: string;
	id: string;
}

export class HoldPlacesController extends BaseController {
	register(basePath: string): Router {
		const router = super.register(basePath);

		this.registerRoute(router, "POST", "/:id/play/launch", this.launchPlay, [
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

		this.registerRoute(router, "POST", "/:id/play/end", this.endPlay, [
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

	async launchPlay(context: Context) {
		const p = context.params as IdParams;
		const verifyResult = await this.verify(p.authorization);
		const playInfo = await getHoldPlacePlayInfo(this.app.firestore, {
			holdPlaceId: p.id,
		});
		const settings = loadAkashicSystemSettings();
		const mode: AkashicExecutionMode = playInfo.ownerUserId === verifyResult.uid ? "active" : "passive";
		const userId = `scramble-${verifyResult.uid}`;
		const system = new AkashicSystemRegistry(settings).getClientForPlay(playInfo.systemUrl);
		const token = await system.createToken(playInfo.akashicPlayId!, userId, mode);
		const content = await resolvePlayContentInfo(playInfo);

		return {
			holdPlaceId: playInfo.holdPlaceId,
			placeId: playInfo.placeId,
			// 従来クライアントとの互換性のため、playIdはAkashic Play IDのまま維持する。
			playId: playInfo.akashicPlayId,
			scramblePlayId: playInfo.currentPlayId,
			akashicPlayId: playInfo.akashicPlayId,
			mode,
			userId,
			gameTitle: content.title,
			gameDescription: content.description,
			contentUrl: content.contentUrl,
			expireAt: playInfo.expireAt?.toDate().toISOString(),
			playToken: token.value,
			playlogServerUrl: token.url,
			gamePageUrl: settings.gamePageUrl,
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
		if (playInfo.akashicPlayId) {
			await this.stopAkashicPlayIfConfigured(playInfo);
		}
		return {
			result: "ok",
			holdPlaceId: playInfo.holdPlaceId,
			placeId: playInfo.placeId,
			playId: playInfo.currentPlayId,
		};
	}

	private async stopAkashicPlayIfConfigured(
		playInfo: Pick<HoldPlacePlayInfo, "akashicPlayId" | "systemUrl">,
	) {
		if (!process.env.AKASHIC_SYSTEM_API_KEY || !playInfo.akashicPlayId) return;
		try {
			const registry = new AkashicSystemRegistry(loadAkashicSystemSettings());
			await registry.getClientForPlay(playInfo.systemUrl).stopPlay(playInfo.akashicPlayId);
		} catch (error) {
			console.warn(error);
		}
	}
}
