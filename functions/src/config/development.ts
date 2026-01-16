import { Config } from "./index";

import defaultConfig = require("./default");

const DevelopmentConfig: Config = {
	...defaultConfig,
};

export = DevelopmentConfig;
