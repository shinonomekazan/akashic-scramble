import * as fw from "../fw";

export type AkashicExecutionMode = "active" | "passive";

export interface AkashicPlay {
	id: string;
	gameCode: string;
	status: string;
}

export interface AkashicPlayToken {
	value: string;
	url: string;
}

export interface AkashicSystemConfig {
	apiBaseUrl: string;
	apiKey: string;
	gamePageUrl: string;
}

export interface AkashicPermission {
	writeTick?: boolean;
	readTick?: boolean;
	subscribeTick?: boolean;
	sendEvent?: boolean;
	subscribeEvent?: boolean;
	maxEventPriority?: number;
}

interface ApiResponse<T> {
	meta: {
		status: number;
		errorCode?: string | number;
		errorMessage?: string;
	};
	data: T;
}

const browserActivePermission: AkashicPermission = {
	writeTick: true,
	readTick: true,
	subscribeTick: true,
	sendEvent: true,
	subscribeEvent: true,
	maxEventPriority: 0,
};

const passivePermission: AkashicPermission = {
	readTick: true,
	subscribeTick: true,
	sendEvent: true,
	maxEventPriority: 2,
};

export function loadAkashicSystemConfig(): AkashicSystemConfig {
	const apiKey = process.env.AKASHIC_SYSTEM_API_KEY;
	if (!apiKey) {
		throw new fw.types.ServiceUnavailableError("Akashic System is not configured.");
	}

	return {
		apiBaseUrl: process.env.AKASHIC_SYSTEM_API_BASE_URL ?? "https://akashic-system.shinonomekazan.com/api",
		apiKey,
		gamePageUrl:
			process.env.AKASHIC_SYSTEM_GAME_PAGE_URL ??
			"https://akashic-system.shinonomekazan.com/contents/index.html",
	};
}

async function requestJson<T>(
	url: string,
	options: { method: string; headers?: Record<string, string> },
	body?: unknown,
): Promise<T> {
	const payload = body == null ? undefined : JSON.stringify(body);
	const response = await fetch(url, {
		method: options.method,
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json; charset=utf-8",
			...(options.headers ?? {}),
		},
		body: payload,
	});
	let json: T;
	try {
		json = (await response.json()) as T;
	} catch {
		throw new Error("Akashic System returned invalid JSON.");
	}
	if (!response.ok) {
		throw new Error(`Akashic System API error: HTTP ${response.status}`);
	}
	return json;
}

export class AkashicSystemClient {
	readonly config: AkashicSystemConfig;

	constructor(config: AkashicSystemConfig = loadAkashicSystemConfig()) {
		this.config = config;
	}

	private request<T>(method: string, path: string, body?: unknown) {
		return requestJson<ApiResponse<T>>(
			`${this.config.apiBaseUrl}${path}`,
			{
				method,
				headers: {
					"X-API-Key": this.config.apiKey,
				},
			},
			body,
		).then((response) => response.data);
	}

	createPlay(gameCode: string) {
		return this.request<AkashicPlay>("POST", "/v1.0/plays", { gameCode });
	}

	getPlay(playId: string) {
		return this.request<AkashicPlay>("GET", `/v1.0/plays/${encodeURIComponent(playId)}`);
	}

	createToken(playId: string, userId: string, mode: AkashicExecutionMode) {
		const permission = mode === "active" ? browserActivePermission : passivePermission;
		return this.request<AkashicPlayToken>("POST", `/v1.0/plays/${encodeURIComponent(playId)}/tokens`, {
			userId,
			permission,
		});
	}

	async stopPlay(playId: string) {
		try {
			await this.request<AkashicPlay>("DELETE", `/v1.0/plays/${encodeURIComponent(playId)}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!message.includes("HTTP 404") && !message.includes("HTTP 409")) {
				throw error;
			}
		}
	}
}
