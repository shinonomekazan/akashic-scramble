import { validationResult, ValidationChain } from "express-validator";

import { Context } from "../Context";
import * as types from "../types";

export class Validator {
	validators: ValidationChain[] = [];

	builded: boolean = false;

	protected build() {}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	sanitize(context: Context): Object | undefined {
		return undefined;
	}

	async validate(context: Context): Promise<Object | undefined> {
		if (!this.builded) {
			this.build();
			this.builded = true;
		}

		// 順番にやるならこっち（こちらでも同一フィールドの多重エラーは発生する）
		/*
		for (let i = 0; i < this.validators.length; i++) {
			const result = await this.validators[i].run(context.req);
			if (result.errors.length > 0) {
				return Promise.reject(new types.BadRequest(
					JSON.stringify(validationResult(context.req).array()),
				));
			}
		}
		*/

		// 一斉にやるならこっち
		await Promise.all(this.validators.map((validator) => validator.run(context.req)));
		const result = validationResult(context.req);
		if (!result.isEmpty()) {
			return Promise.reject(new types.BadRequest(JSON.stringify(result.array())));
		}

		return this.sanitize(context);
	}
}
