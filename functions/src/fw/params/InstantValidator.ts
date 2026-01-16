import { ValidationChain } from "express-validator";

import { Context } from "../Context";
import { Validator } from "./Validator";

export function InstantValidator(validators: ValidationChain[], sanitizer?: (context: Context) => Object | undefined) {
	const validator = new Validator();
	validator.builded = true;
	validators.forEach((v) => {
		validator.validators.push(v);
	});
	if (sanitizer != null) {
		validator.sanitize = (context: Context) => sanitizer.call(validator, context);
	}
	return validator;
}
