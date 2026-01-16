import * as express from "express";

import { App } from "../App";
import { Context } from "./Context";
import { RequestHandler } from "./RequestHandler";
import * as params from "./params";
import * as types from "./types";

interface Routing {
	method: types.Method;
	path: string;
}

const defaultRoutingMap: { [name: string]: Routing } = {
	index: {
		method: "GET",
		path: "/",
	},
	get: {
		method: "GET",
		path: "/:id",
	},
	put: {
		method: "PUT",
		path: "/:id",
	},
	delete: {
		method: "DELETE",
		path: "/:id",
	},
	post: {
		method: "POST",
		path: "/",
	},
};

const defaultStringIdValidator = new params.StringIdValidator();
export abstract class Controller<APP extends App> {
	routingMap: { [name: string]: Routing };

	app: APP;

	validators: { [key: string]: params.Validator[] };

	constructor(app: APP) {
		this.app = app;
		this.validators = {
			get: [defaultStringIdValidator],
			put: [defaultStringIdValidator],
			delete: [defaultStringIdValidator],
		};
		this.routingMap = { ...defaultRoutingMap };
		Object.keys(this.routingMap).forEach((key) => {
			this.routingMap[key] = { ...this.routingMap[key] };
		});
	}

	register(basePath: string) {
		const router = this.app.createRouter(basePath);
		for (const name of Object.keys(this.routingMap)) {
			if (typeof (this as any)[name] !== "function") continue;
			const mtr = this.routingMap[name];
			this.registerRoute(router, mtr.method, mtr.path, (this as any)[name], this.validators[name]);
		}
		return router;
	}

	registerRoute(
		router: express.Router,
		method: types.Method,
		path: string,
		func: RequestHandler,
		validators?: params.Validator[],
	) {
		router[method.toLowerCase() as types.LowerMethod](
			path,
			async (req: express.Request, res: express.Response) => {
				const context: Context = {
					req,
					res,
					params: {},
				};

				if (validators) {
					for (let i = 0; i < validators.length; i++) {
						// eslint-disable-next-line no-await-in-loop
						const sanitizeResult = await validators[i].validate(context);
						if (sanitizeResult) {
							context.params = Object.assign(context.params, sanitizeResult);
						}
					}
				}

				const result = await func.call(this, context);
				res.json({
					meta: {
						status: types.StatusCode.Ok,
					},
					data: result,
				});
			},
		);
	}
}
