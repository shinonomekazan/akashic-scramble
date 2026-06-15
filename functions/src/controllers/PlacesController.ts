import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { getCurrentHoldPlacePlayInfo, holdPlace, releaseHoldPlace, setHoldPlacePlay } from "../stores";
import { AkashicSystemClient, loadAkashicSystemConfig } from "../services/akashicSystem";
import { GameDriveClient, loadGameDriveConfig } from "../services/gameDrive";

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
			return {
				holdPlaceId: target.holdPlaceId,
				placeId: target.placeId,
				playId: target.currentPlayId,
				gameCode: target.gameCode ?? config.defaultGameCode,
				gameTitle: target.gameTitle ?? config.defaultGameTitle,
				gameDescription: target.gameDescription ?? config.defaultGameDescription,
				contentUrl: target.contentUrl ?? config.defaultContentUrl,
				inputAdapter: target.inputAdapter ?? config.defaultInputAdapter,
				expireAt: target.expireAt?.toDate().toISOString(),
				joinPath: `/play/${encodeURIComponent(target.holdPlaceId)}`,
			};
		}

		const game = await this.resolveGameConfig(config);
		const system = new AkashicSystemClient(config);
		const gameCode = `scramble-${target.holdPlaceId}-${game.gameCode}`;
		const createdPlay = await system.createPlay(gameCode);
		let storedPlay;
		try {
			storedPlay = await setHoldPlacePlay(this.app.firestore, {
				holdPlaceId: target.holdPlaceId,
				holdUserId: verifyResult.uid,
				systemPlayId: createdPlay.id,
				providerId: game.providerId,
				contentCode: game.contentCode,
				gameCode,
				gameTitle: game.title,
				gameDescription: game.description,
				contentUrl: game.contentUrl,
				inputAdapter: config.defaultInputAdapter,
				ownerUserId: verifyResult.uid,
			});

			if (storedPlay.currentPlayId !== createdPlay.id) {
				await system.stopPlay(createdPlay.id);
			}
		} catch (error) {
			await system.stopPlay(createdPlay.id);
			throw error;
		}

		return {
			holdPlaceId: storedPlay.holdPlaceId,
			placeId: storedPlay.placeId,
			playId: storedPlay.currentPlayId,
			gameCode: storedPlay.gameCode ?? gameCode,
			gameTitle: storedPlay.gameTitle ?? config.defaultGameTitle,
			gameDescription: storedPlay.gameDescription ?? config.defaultGameDescription,
			contentUrl: storedPlay.contentUrl ?? config.defaultContentUrl,
			inputAdapter: storedPlay.inputAdapter ?? config.defaultInputAdapter,
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

	private async resolveGameConfig(config: ReturnType<typeof loadAkashicSystemConfig>) {
		const gameDriveConfig = loadGameDriveConfig();
		if (!gameDriveConfig.contentId) {
			return {
				providerId: "akashic-system",
				contentCode: config.defaultGameCode,
				gameCode: config.defaultGameCode,
				title: config.defaultGameTitle,
				description: config.defaultGameDescription,
				contentUrl: config.defaultContentUrl,
			};
		}

		const content = await new GameDriveClient(gameDriveConfig).resolveContent(gameDriveConfig.contentId);
		return {
			providerId: "akashic-game-drive",
			contentCode: content.contentId,
			gameCode: `game-drive-${content.contentId}`,
			title: content.title,
			description: content.description,
			contentUrl: content.contentUrl,
		};
	}
}
