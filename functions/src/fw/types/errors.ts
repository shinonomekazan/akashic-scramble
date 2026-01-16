import { StatusCode, ErrorCode } from "./codes";

export abstract class BaseError extends Error {
	public readonly status: StatusCode;

	public readonly errorCode: number;

	public data?: { [key: string]: any };

	constructor(status: StatusCode, errorCode: number, message: string) {
		super(message);

		this.name = new.target.name;
		// Note: TSのターゲット設定によっては必要になる
		// Object.setPrototypeOf(this, new.target.prototype);

		this.status = status;
		this.errorCode = errorCode;
		this.data = undefined;
	}
}

export class BadRequest extends BaseError {
	constructor(message?: string) {
		super(StatusCode.BadRequest, ErrorCode.BadRequest, message != null ? message : "BadRequest");
	}
}

export class Unauthorized extends BaseError {
	constructor(message?: string) {
		super(StatusCode.Unautorized, ErrorCode.Unautorized, message == null ? "Unauthorized" : message);
	}
}

export class Forbidden extends BaseError {
	constructor(message?: string) {
		super(StatusCode.Forbidden, ErrorCode.Forbidden, message == null ? "Forbidden" : message);
	}
}

export class NotFound extends BaseError {
	constructor(message?: string) {
		super(StatusCode.NotFound, ErrorCode.NotFound, message == null ? "NotFound" : message);
	}
}
export class Duplicate extends BaseError {
	constructor(message?: string) {
		super(StatusCode.Conflict, ErrorCode.Conflict, message == null ? "Duplicate" : message);
	}
}

export class InternalServerError extends BaseError {
	constructor(message?: string) {
		super(
			StatusCode.InternalServerError,
			ErrorCode.InternalServerError,
			message == null ? "InternalServerError" : message,
		);
	}
}

export class ServiceUnavailableError extends BaseError {
	constructor(message?: string) {
		super(
			StatusCode.ServiceUnavailable,
			ErrorCode.ServiceUnavailable,
			message == null ? "ServiceUnavailable" : message,
		);
	}
}
