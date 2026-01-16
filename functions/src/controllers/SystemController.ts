import BaseController from "./BaseController";
const pkg = require("../../package.json");

export class SystemController extends BaseController {
	async index() {
		return {
			version: pkg.version,
			time: Date.now(),
		};
	}
}
