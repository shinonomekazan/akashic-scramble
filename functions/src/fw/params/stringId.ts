import * as validators from "express-validator";

import { Context } from "../Context";
import { Validator } from "./Validator";

export interface StringIdParams {
	[key: string]: string;
}

export class StringIdValidator extends Validator {
	field: string;

	constructor(field = "id") {
		super();
		this.field = field;
	}

	protected build() {
		this.validators.push(validators.param(this.field).not().isEmpty());
	}

	sanitize(context: Context) {
		return {
			[this.field]: context.req.params[this.field],
		} as StringIdParams;
	}
}
