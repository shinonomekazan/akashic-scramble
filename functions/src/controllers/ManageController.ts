import { Router } from "express";
import BaseController from "./BaseController";
import * as fw from "../fw";
import * as params from "../params";
import * as validators from "express-validator";
import { Context } from "../Context";
import * as resolvers from "../resolvers";

interface AuthenticateManageUserParams {
	authorization: string;
	id: "me" | string;
}

export class ManageController extends BaseController {
	register(basePath: string): Router {
		const router = super.register(basePath);

		this.registerRoute(router, "POST", "/:id/authenticate", this.authenticate, [
			fw.params.InstantValidator(
				[params.headerBearerTokenValidatorOptional(), validators.param("id").isString().notEmpty()],
				(context) =>
					({
						authorization: context.req.headers.authorization,
						id: context.req.params.id as "me" | string,
					}) as AuthenticateManageUserParams,
			),
		]);

		return router;
	}

	async authenticate(context: Context) {
		const p = context.params as AuthenticateManageUserParams;
		if (p.authorization == null) {
			throw new fw.types.BadRequest("認証情報が必要です");
		}
		const verifyResult = await this.verify(p.authorization);
		const targetId = p.id === "me" ? verifyResult.uid : p.id;
		if (targetId !== verifyResult.uid) {
			throw new fw.types.Forbidden("必要な権限がありません。");
		}
		const manageUser = await resolvers.manage.resolve(this.app.firestore, targetId);
		if (!manageUser) {
			throw new fw.types.Forbidden("必要な権限がありません。");
		}

		const desiredRoleClaim = manageUser.role === "administrator" ? "admin" : undefined;
		const userRecord = await this.app.auth.getUser(targetId);
		const currentClaims = userRecord.customClaims ?? {};
		if (currentClaims.role !== desiredRoleClaim) {
			const nextClaims: Record<string, any> = { ...currentClaims };
			if (desiredRoleClaim) {
				nextClaims.role = desiredRoleClaim;
			} else {
				delete nextClaims.role;
			}
			await this.app.auth.setCustomUserClaims(targetId, nextClaims);
		}

		return { role: desiredRoleClaim ?? null };
	}
}
