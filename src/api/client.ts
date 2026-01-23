import type { ApiConfig } from "../config.types";
import * as responses from "./responses";

interface ClientOptions {
	apiConfig: ApiConfig;
	useEmulator: boolean;
	apiKey?: string;
	authorization?: string;
}

export class CallApiError extends Error {
	response: responses.BaseResponse<any>;

	constructor(message: string, response: responses.BaseResponse<any>) {
		super(message);
		this.response = response;
	}
}

export function resolveApiBaseUrl(config: ApiConfig, useEmulator: boolean) {
	if (useEmulator && config.emulatorBaseUrl) {
		return config.emulatorBaseUrl;
	}
	return config.baseUrl;
}

export class Client {
	readonly baseHeaders: { [key: string]: string };

	baseUrl!: string;

	requestId: number;

	idTokenFunction?: () => Promise<string>;

	apiKey?: string;

	private apiConfig: ApiConfig;

	private useEmulator: boolean;

	constructor(options: ClientOptions) {
		this.requestId = 0;
		this.baseHeaders = {
			"Content-Type": "application/json; charset=utf-8",
		};
		this.apiKey = undefined;
		this.apiConfig = options.apiConfig;
		this.useEmulator = options.useEmulator;

		this.changeOptions(options);
	}

	isReady() {
		return this.baseUrl !== "";
	}

	changeOptions(options: ClientOptions) {
		this.apiConfig = options.apiConfig;
		this.useEmulator = options.useEmulator;
		this.baseUrl = resolveApiBaseUrl(this.apiConfig, this.useEmulator);
		const apiKey = options.apiKey ?? this.apiConfig.apiKey;
		this.apiKey = apiKey;
		if (apiKey != null) {
			this.baseHeaders["X-API-KEY"] = apiKey;
		} else {
			delete this.baseHeaders["X-API-KEY"];
		}
		if (options.authorization != null) {
			this.baseHeaders["Authorization"] = options.authorization;
		} else {
			delete this.baseHeaders["Authorization"];
		}
	}

	buildHeaders(headers?: { [key: string]: string }): { [key: string]: string } {
		if (headers != null) {
			return {
				...this.baseHeaders,
				...headers,
			};
		}
		return {
			...this.baseHeaders,
		};
	}

	call<T>(method: string, path: string, body?: string): Promise<responses.BaseResponse<T>> {
		return this.callAny(method, path, body);
	}

	async callWithAuthorization<T>(method: string, path: string, body?: string): Promise<responses.BaseResponse<T>> {
		if (this.baseHeaders["Authorization"] == null && this.idTokenFunction == null) {
			throw new Error("Authorization not found");
		} else if (this.baseHeaders["Authorization"] == null && this.idTokenFunction != null) {
			const authorization = await this.idTokenFunction();
			return this.callAny(method, path, body, {
				Authorization: `Bearer ${authorization}`,
			});
		}
		return this.callAny(method, path, body);
	}

	async callAny<T>(method: string, path: string, body?: string, headers?: { [key: string]: string }) {
		const url = `${this.baseUrl}${path}`;
		const requestId = ++this.requestId;
		if (requestId) {
			// requestId is reserved for future debugging usage.
		}
		const response = await fetch(url, {
			method,
			headers: this.buildHeaders(headers),
			body,
		});
		if (!response.ok) {
			let json: responses.BaseResponse<any> | undefined = undefined;
			try {
				json = (await response.json()) as responses.BaseResponse<any>;
			} catch (error) {
				console.log(error);
				throw new Error(`Can not call ${method} ${url}: ${response.status}, not json response.`);
			}
			throw new CallApiError(`Can not call ${method} ${url}: ${response.status}`, json);
		}
		return (await response.json()) as T;
	}
}
