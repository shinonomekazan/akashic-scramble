import { Context } from "./Context";

export interface RequestHandler {
	(context: Context): Promise<any>;
}
