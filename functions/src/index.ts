import { initializeApp, applicationDefault, getApps, getApp } from "firebase-admin/app";
import { onRequest, Request } from "firebase-functions/v2/https";
import { Response } from "express";
import * as path from "path";
import { App } from "./App";
import { AppConfig, Config } from "./config";
import * as fw from "./fw";
import { register } from "./register";

let app: App | undefined = undefined;
const apiKey = process.env.API_KEY;
function processRequest(app: App, apiKey: string | undefined, request: Request, response: Response) {
	if (request.method !== "OPTIONS" && !request.path.startsWith("/debug/") && request.path !== "/") {
		if (apiKey != null) {
			const xApiKey = request.header("X-API-KEY");
			if (xApiKey !== apiKey) {
				response.status(403).send(
					JSON.stringify({
						meta: {
							status: 403,
							errorCode: "INVALID_API_KEY",
						},
					}),
				);
				return undefined;
			}
		}
	}
	return app.app(request, response);
}
export const api = onRequest({ region: "asia-northeast1" }, (request, response) => {
	if (app == null) {
		return fw
			.Configure<Config>(path.resolve(__dirname, "config"))
			.then((config) => {
				const firebaseApp =
					getApps().length === 0
						? initializeApp({
								credential: applicationDefault(),
							})
						: getApp();
				app = new App(firebaseApp, config.app as AppConfig);
				register(app);
				return app;
			})
			.then((initializedApp) => {
				return processRequest(initializedApp, apiKey, request, response);
			});
	} else {
		return processRequest(app, apiKey, request, response);
	}
});
