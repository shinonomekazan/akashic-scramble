import { App } from "../App";
import { Context } from "../Context";
import BaseController from "./BaseController";
import * as validators from "express-validator";
import * as fw from "../fw";
import * as params from "../params";
import * as resolvers from "../resolvers";
import { storeUser, updateUser } from "../stores";

interface RegisterParams {
	name: string;
	authorization: string;
}

interface UpdateParams {
	authorization: string;
	id: "me" | string;
	name: string;
}

interface GetParams {
	id: string;
}

export class UsersController extends BaseController {
	constructor(app: App) {
		super(app);
		this.validators.post = [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidator(), validators.body("name").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						name: context.req.body.name,
					}) as RegisterParams,
			),
		];

		this.validators.put = [
			fw.params.InstantValidator(
				[
					params.headerBearerTokenValidator(),
					validators.param("id").isString().notEmpty(),
					validators.body("name").isString().notEmpty(),
				],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as "me" | string,
						name: context.req.body.name,
					}) as UpdateParams,
			),
		];
	}

	async get(context: Context) {
		const p = context.params as GetParams;
		return {
			user: await resolvers.users.resolve(this.app.firestore, p.id),
		};
	}

	async post(context: Context) {
		const p = context.params as RegisterParams;
		const verifyResult = await this.verify(p.authorization);
		await storeUser(this.app.firestore, {
			uid: verifyResult.uid,
			name: p.name,
		});
		return {
			user: await resolvers.users.resolve(this.app.firestore, verifyResult.uid),
		};
	}

	async put(context: Context) {
		const p = context.params as UpdateParams;
		const verifyResult = await this.verify(p.authorization);
		if (p.id !== "me" && p.id !== verifyResult.uid) {
			throw new fw.types.BadRequest("不正なリクエストです");
		}
		const result = await resolvers.users.resolve(this.app.firestore, verifyResult.uid);
		if (result === null) {
			throw new fw.types.NotFound("ユーザーが見つかりません");
		}
		await updateUser(this.app.firestore, {
			uid: verifyResult.uid,
			name: p.name,
		});
		return {
			result: "ok",
		};
	}
}
