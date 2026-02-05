import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import { Router } from "express";
import { holdPlace, releaseHoldPlace } from "../stores";

interface IdParams {
	authorization: string;
	id: string;
}

export class PlacesController extends BaseController {
	constructor(app: App) {
		super(app);
		this.routingMap.release = {
			method: "POST",
			path: "/:id/release",
		};

		this.validators.release = [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as string,
					}) as IdParams,
			),
		];
	}

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
		await releaseHoldPlace(this.app.firestore, {
			placeId: p.id,
			holdUserId: verifyResult.uid,
		});
		return { result: "ok" };
	}
}
