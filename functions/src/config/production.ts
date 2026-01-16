import { Config } from "./index";

import defaultConfig = require("./default");

const ProductionConfig: Config = {
	...defaultConfig,
};

export = ProductionConfig;
