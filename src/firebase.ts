import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import type { FirebaseConfig } from "./config.types";

export interface FirebaseInstance {
	app: ReturnType<typeof initializeApp>;
	auth: ReturnType<typeof getAuth>;
	analytics: ReturnType<typeof getAnalytics> | null;
}

export function initializeFirebase(options: FirebaseConfig): FirebaseInstance {
	const app = initializeApp(options);
	const auth = getAuth(app);
	let analytics: ReturnType<typeof getAnalytics> | null = null;

	try {
		analytics = getAnalytics(app);
	} catch (err) {
		console.warn("この環境ではAnalyticsを利用できません。", err);
	}

	return { app, auth, analytics };
}
