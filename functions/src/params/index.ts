import * as validators from "express-validator";

export function bearerTokenValidator(input: any) {
	if (typeof input !== "string") {
		throw new Error("入力は文字列である必要があります");
	}
	if (input.toLowerCase().startsWith("bearer ")) {
		return true;
	}
	throw new Error("Bearerトークンのみサポートされています");
}

export function bearerTokenValidatorOptional(input: any) {
	if (input == null) {
		return true;
	}
	return bearerTokenValidator(input);
}

export function headerBearerTokenValidator() {
	return validators.header("authorization").isString().notEmpty().custom(bearerTokenValidator);
}

export function headerBearerTokenValidatorOptional() {
	return validators.header("authorization").optional().isString().notEmpty().custom(bearerTokenValidatorOptional);
}
