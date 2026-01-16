import { Controller } from "./Controller";

export interface ControllerConstructor {
	// TODO: 本当は app: App にしたいけど上手くビルドが通せない ;_;
	new (app: any): Controller<any>;
}
