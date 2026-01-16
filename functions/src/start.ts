import "dotenv/config";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import * as path from "path";

import { App } from "./App";
import { AppConfig } from "./config";
import * as fw from "./fw";
import { register } from "./register";

const firebaseApp = initializeApp({
	credential: applicationDefault(),
});

fw.Configure(path.resolve(__dirname, "config")).then((config) => {
	const app = new App(firebaseApp, config.app as AppConfig);

	register(app);

	process.on("SIGINT", () => {
		app.shutdown()
			.then(() => {
				process.exit(0);
			})
			.catch((err) => {
				console.error(err);
				process.exit(1);
			});
	});

	app.start();
});
