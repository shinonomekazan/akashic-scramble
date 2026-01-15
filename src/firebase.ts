import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import type { FirebaseConfig } from "./config.types";

export interface FirebaseInstance {
	app: ReturnType<typeof initializeApp>;
	auth: ReturnType<typeof getAuth>;
	firestore: ReturnType<typeof getFirestore>;
	analytics: ReturnType<typeof getAnalytics> | null;
}

export function initializeFirebase(options: FirebaseConfig): FirebaseInstance {
	const app = initializeApp(options);
	const auth = getAuth(app);
	const firestore = getFirestore(app);
	let analytics: ReturnType<typeof getAnalytics> | null = null;

	try {
		analytics = getAnalytics(app);
	} catch (err) {
		console.warn("この環境ではAnalyticsを利用できません。", err);
	}

	return { app, auth, firestore, analytics };
}
