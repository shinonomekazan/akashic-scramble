import * as fw from "../fw";

export interface Config extends fw.Config {
	app: AppConfig;
}

export interface AppConfig extends fw.AppConfig {}
