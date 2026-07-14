import * as express from "express";
import { IncomingMessage, ServerResponse } from "http";
import Router from "express-promise-router";
import { ControllerConstructor } from "./ControllerConstructor";
import { AppConfig } from "./config";

type expressVerifyFunction = (req: IncomingMessage, res: ServerResponse, buf: Buffer, encoding: string) => void;

const SCRAMBLE_HOSTING_PREVIEW_ORIGIN = /^https:\/\/akashic-scramble--[a-z0-9-]+\.web\.app$/;

function isAllowedCorsOrigin(origin: string) {
	if (origin === "https://akashic-scramble.web.app") return true;
	if (origin === "https://akashic-scramble.firebaseapp.com") return true;
	if (SCRAMBLE_HOSTING_PREVIEW_ORIGIN.test(origin)) return true;

	try {
		const url = new URL(origin);
		return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.protocol === "http:";
	} catch {
		return false;
	}
}

// eslint-disable-next-line import/prefer-default-export
export class App<T extends AppConfig> {
	readonly app: express.Express;

	readonly config: T;

	constructor(config: T, jsonParserOptions?: { verify?: expressVerifyFunction }) {
		this.app = express.default();
		this.app.use(express.json(jsonParserOptions));
		this.config = config;
	}

	enableCors(...customHeaders: string[]) {
		this.app.use((req, res, next) => {
			const origin = req.headers.origin;
			if (typeof origin === "string" && isAllowedCorsOrigin(origin)) {
				res.header("Access-Control-Allow-Origin", origin);
				res.header("Vary", "Origin");
			}
			res.header(
				"Access-Control-Allow-Headers",
				["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"]
					.concat(customHeaders ?? [])
					.join(", "),
			);
			res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
			if (req.method === "OPTIONS") {
				res.sendStatus(204);
				return;
			}
			next();
		});
	}

	createRouter(basePath?: string) {
		const router = Router();
		if (basePath == null) {
			this.app.use(router);
		} else {
			this.app.use(basePath, router);
		}
		return router;
	}

	register(routes: { [key: string]: ControllerConstructor }) {
		Object.keys(routes).forEach((path) => {
			new routes[path](this).register(path);
		});
	}

	start() {
		this.app.listen(this.config.port, this.onListen.bind(this));
	}

	onListen() {
		console.log(`App started on port:${this.config.port}`);
	}

	shutdown(): Promise<void> {
		// TODO: implement shutdown logic here
		return Promise.resolve();
	}

	use(handler: express.ErrorRequestHandler | express.RequestHandler): void;

	use(path: string, handler: express.ErrorRequestHandler | express.RequestHandler): void;

	use(
		pathOrHandler: string | (express.ErrorRequestHandler | express.RequestHandler),
		handler?: express.ErrorRequestHandler | express.RequestHandler,
	) {
		if (handler != null) {
			this.app.use(pathOrHandler as string, handler);
		} else {
			this.app.use(pathOrHandler as express.ErrorRequestHandler | express.RequestHandler);
		}
	}
}
