import * as express from "express";

import * as types from "../types";

export function UndefinedRouteHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
	if (res.headersSent) {
		return next();
	}
	return next(new types.NotFound(`API Not Found: ${req.path}`));
}
