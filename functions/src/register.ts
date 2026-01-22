import { App } from "./App";
import * as controllers from "./controllers";
import * as fw from "./fw";

export function register(app: App) {
	app.enableCors("X-API-KEY");
	app.enableCredentials();

	app.register({
		"/": controllers.SystemController,
		"/users": controllers.UsersController,
	});

	app.use(fw.middlewares.UndefinedRouteHandler);
	app.use(fw.middlewares.ErrorHandler);
}
