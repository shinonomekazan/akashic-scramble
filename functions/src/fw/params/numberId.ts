import * as validators from "express-validator";

import { Context } from "../Context";
import { Validator } from "./Validator";

export interface NumberIdParams {
	[key: string]: number;
}

export class NumberIdValidator extends Validator {
	field: string;

	constructor(field = "id") {
		super();
		this.field = field;
	}

	protected build() {
		this.validators.push(validators.param(this.field).isInt());
	}

	sanitize(context: Context) {
		return {
			[this.field]: parseInt(context.req.params[this.field], 10),
		} as NumberIdParams;
	}
}
