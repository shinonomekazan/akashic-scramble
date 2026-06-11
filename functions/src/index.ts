import { initializeApp, applicationDefault, getApps, getApp, App as FirebaseApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { onRequest, Request } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Response } from "express";
import * as path from "path";
import { App } from "./App";
import { AppConfig, Config } from "./config";
import * as fw from "./fw";
import { register } from "./register";
import { expireHoldPlace } from "./stores";
import { AkashicSystemClient } from "./services/akashicSystem";

let app: App | undefined = undefined;
let firebaseApp: FirebaseApp | undefined = undefined;
const apiKey = process.env.API_KEY;

function getFirebaseApp(): FirebaseApp {
	if (firebaseApp) return firebaseApp;
	firebaseApp =
		getApps().length === 0
			? initializeApp({
					credential: applicationDefault(),
				})
			: getApp();
	return firebaseApp;
}

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
				const adminApp = getFirebaseApp();
				app = new App(adminApp, config.app as AppConfig);
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

export const expireHoldPlaces = onSchedule({ region: "asia-northeast1", schedule: "every 1 minutes" }, async () => {
	const adminApp = getFirebaseApp();
	const firestore = getFirestore(adminApp);
	const now = Timestamp.now();
	const snapshot = await firestore.collection("holdPlaces").where("expireAt", "<=", now).limit(50).get();

	if (snapshot.empty) return;

	for (const doc of snapshot.docs) {
		const endedHoldPlace = await expireHoldPlace(firestore, {
			holdPlaceId: doc.id,
			now,
		});
		if (endedHoldPlace?.currentPlayId && process.env.AKASHIC_SYSTEM_API_KEY) {
			try {
				await new AkashicSystemClient().stopPlay(endedHoldPlace.currentPlayId);
			} catch (error) {
				console.warn(error);
			}
		}
	}
});
