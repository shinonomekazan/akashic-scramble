import { App as FirebaseApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { Auth, getAuth } from "firebase-admin/auth";
import { AppConfig } from "./config";
import * as fw from "./fw";

export class App extends fw.App<AppConfig> {
	readonly firebaseApp: FirebaseApp;

	readonly firestore: Firestore;

	readonly auth: Auth;

	constructor(firebaseApp: FirebaseApp, config: AppConfig) {
		super(config);

		this.firebaseApp = firebaseApp;
		this.firestore = getFirestore(firebaseApp);
		this.auth = getAuth(firebaseApp);
	}

	enableCredentials() {
		this.app.use((req, res, next) => {
			res.header("Access-Control-Allow-Credentials", "true");
			next();
		});
	}
}
