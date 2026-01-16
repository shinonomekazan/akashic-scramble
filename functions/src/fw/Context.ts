import * as express from "express";

export interface Context {
	req: express.Request;
	res: express.Response;
	params: any;
}
