import type { AppConfig } from "./config.types";

const fallbackEnv = {
	FIREBASE_API_KEY: "AIzaSyBjP85W46ywlRx-3ToaOUBbzyPr0eg3mPM",
	FIREBASE_AUTH_DOMAIN: "akashic-scramble.firebaseapp.com",
	FIREBASE_PROJECT_ID: "akashic-scramble",
	FIREBASE_STORAGE_BUCKET: "akashic-scramble.firebasestorage.app",
	FIREBASE_MESSAGING_SENDER_ID: "166175468898",
	FIREBASE_APP_ID: "1:166175468898:web:4c8f59dc4638de3f1dd03b",
	FIREBASE_MEASUREMENT_ID: "G-TBNNR7GQ2R",
};

function resolveEnv(key: keyof typeof fallbackEnv): string {
	const value = process.env[key] ?? fallbackEnv[key];
	if (!value || value === "undefined") {
		throw new Error(`${key} が設定されていません`);
	}
	return value;
}

export function configure(): AppConfig {
	const projectId = resolveEnv("FIREBASE_PROJECT_ID");
	const functionsRegion = "asia-northeast1";
	return {
		firebaseConfig: {
			apiKey: resolveEnv("FIREBASE_API_KEY"),
			authDomain: resolveEnv("FIREBASE_AUTH_DOMAIN"),
			projectId,
			storageBucket: resolveEnv("FIREBASE_STORAGE_BUCKET"),
			messagingSenderId: resolveEnv("FIREBASE_MESSAGING_SENDER_ID"),
			appId: resolveEnv("FIREBASE_APP_ID"),
			measurementId: resolveEnv("FIREBASE_MEASUREMENT_ID"),
		},
		apiConfig: {
			baseUrl: `https://api-37ei3sbwpa-an.a.run.app`,
			emulatorBaseUrl: `http://127.0.0.1:5001/${projectId}/${functionsRegion}/api`,
			apiKey: "745bd08b-0b2d-45a5-8b3d-714b264b6221",
		},
	};
}

export const appConfig = configure();
