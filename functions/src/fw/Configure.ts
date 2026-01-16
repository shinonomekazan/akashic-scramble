import * as path from "path";

import { Config } from "./config";

export function Configure<T extends Config>(basePath: string) {
	// node-configが気に要らないので適当に自作した

	const env = (process.env.APP_ENV || "default").toLowerCase();
	let config: T | null = null;

	return new Promise<T>((resolve, reject) => {
		if (config != null) {
			resolve(config);
			return;
		}

		(import(path.join(basePath, env)) as Promise<T>)
			.then((envConfig) => {
				config = envConfig;
				resolve(config);
			})
			.catch((err) => {
				console.warn(`can not find config file for ${env}`, err);
				reject(err);
			});
	});
}
