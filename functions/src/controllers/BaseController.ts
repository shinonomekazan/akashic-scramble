import { App } from "../App";
import * as fw from "../fw";

export default class extends fw.Controller<App> {
	verify(authorization: string) {
		const bearerTokenMatch = authorization?.match(/bearer\s/i);
		if (bearerTokenMatch == null || bearerTokenMatch.index == null) {
			throw new fw.types.BadRequest("Bearer token not found");
		}
		const bearerToken = authorization.substring(bearerTokenMatch.index + 7);
		return this.app.auth.verifyIdToken(bearerToken);
	}
}
