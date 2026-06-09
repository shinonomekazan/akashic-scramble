import * as http from "http";
import * as https from "https";

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
	defaultGameCode: string;
	defaultGameTitle: string;
	defaultGameDescription: string;
	defaultContentUrl: string;
	defaultInputAdapter: string;
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

function normalizeBaseUrl(value: string) {
	return value.trim().replace(/\/+$/, "");
}

export function loadAkashicSystemConfig(): AkashicSystemConfig {
	const apiKey = process.env.AKASHIC_SYSTEM_API_KEY;
	if (!apiKey) {
		throw new Error("AKASHIC_SYSTEM_API_KEY is not configured.");
	}

	return {
		apiBaseUrl: normalizeBaseUrl(process.env.AKASHIC_SYSTEM_API_BASE_URL ?? "https://akashic-system.shinonomekazan.com/api"),
		apiKey,
		gamePageUrl: process.env.AKASHIC_SYSTEM_GAME_PAGE_URL ?? "https://akashic-system.shinonomekazan.com/contents/index.html",
		defaultGameCode: process.env.SCRAMBLE_AKASHIC_GAME_CODE ?? "rocket-game",
		defaultGameTitle: process.env.SCRAMBLE_AKASHIC_GAME_TITLE ?? "Rocket Game",
		defaultGameDescription:
			process.env.SCRAMBLE_AKASHIC_GAME_DESCRIPTION ?? "ロケットを操作して遊ぶAkashicコンテンツです。",
		defaultContentUrl: process.env.SCRAMBLE_AKASHIC_CONTENT_URL ?? "/contents/rocket-game/content.json",
		defaultInputAdapter: process.env.SCRAMBLE_AKASHIC_INPUT_ADAPTER ?? "rocket-game",
	};
}

function requestJson<T>(url: string, options: https.RequestOptions, body?: unknown): Promise<T> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const transport = parsedUrl.protocol === "http:" ? http : https;
		const payload = body == null ? undefined : JSON.stringify(body);
		const request = transport.request(
			parsedUrl,
			{
				...options,
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json; charset=utf-8",
					...(payload != null ? { "Content-Length": Buffer.byteLength(payload) } : {}),
					...(options.headers ?? {}),
				},
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					let json: T;
					try {
						json = text ? (JSON.parse(text) as T) : ({} as T);
					} catch (error) {
						reject(new Error(`Akashic System returned invalid JSON: ${text.slice(0, 120)}`));
						return;
					}
					if (response.statusCode == null || response.statusCode < 200 || response.statusCode >= 300) {
						reject(new Error(`Akashic System API error: HTTP ${response.statusCode} ${text.slice(0, 120)}`));
						return;
					}
					resolve(json);
				});
			},
		);
		request.on("error", reject);
		if (payload != null) request.write(payload);
		request.end();
	});
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
