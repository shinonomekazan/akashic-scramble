import "dotenv/config";
import * as fs from "fs";
import { initializeApp } from "firebase-admin/app";
import { credential } from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

export function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS!;
const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

const firebaseApp = initializeApp({
	credential: credential.cert(serviceAccount),
});

export const db = getFirestore(firebaseApp);
