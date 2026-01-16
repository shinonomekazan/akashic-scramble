import * as express from "express";

import * as types from "../types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ErrorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
	if (res.headersSent) {
		next(err);
		return;
	}
	const response: types.ApiResponseWithoutData = {
		meta: {
			status: types.StatusCode.InternalServerError,
			errorCode: types.ErrorCode.InternalServerError,
			message: err == null || err.message == null ? "Undefined error." : err.message,
		},
	};

	if (err instanceof types.BaseError) {
		response.meta.status = err.status;
		response.meta.errorCode = err.errorCode;
		response.meta.message = err.message;
		if (err.data !== undefined) {
			response.data = err.data;
		}
	} else if (err instanceof URIError) {
		response.meta.status = types.StatusCode.BadRequest;
		response.meta.errorCode = types.ErrorCode.BadRequest;
	} else {
		console.log("untrapped error", err);
	}

	res.status(response.meta.status);
	res.json(response);
}
