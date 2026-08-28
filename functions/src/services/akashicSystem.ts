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
}

export interface AkashicSystemSettings {
	systems: AkashicSystemConfig[];
	legacySystem: AkashicSystemConfig;
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

interface AkashicPlayList {
	values: AkashicPlay[];
	totalCount?: number;
}

const DEFAULT_LEGACY_API_BASE_URL = "https://akashic-system.shinonomekazan.com/api";

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

function normalizeApiBaseUrl(value: string) {
	const normalized = value.trim().replace(/\/+$/, "");
	try {
		const url = new URL(normalized);
		if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
	} catch {
		throw new fw.types.ServiceUnavailableError("Akashic System URL is invalid.");
	}
	return normalized;
}

export function loadAkashicSystemSettings(): AkashicSystemSettings {
	const apiKey = process.env.AKASHIC_SYSTEM_API_KEY;
	if (!apiKey) {
		throw new fw.types.ServiceUnavailableError("Akashic System is not configured.");
	}

	const legacyApiBaseUrl = normalizeApiBaseUrl(
		process.env.AKASHIC_SYSTEM_API_BASE_URL ?? DEFAULT_LEGACY_API_BASE_URL,
	);
	const configuredSystemUrls = process.env.AKASHIC_SYSTEM_API_BASE_URLS?.split(",")
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	const systemUrls = configuredSystemUrls?.length ? configuredSystemUrls : [legacyApiBaseUrl];
	const uniqueSystemUrls = [...new Set(systemUrls.map(normalizeApiBaseUrl))];
	return {
		systems: uniqueSystemUrls.map((apiBaseUrl) => ({ apiBaseUrl, apiKey })),
		legacySystem: { apiBaseUrl: legacyApiBaseUrl, apiKey },
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

	constructor(config: AkashicSystemConfig) {
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

	async getRunningPlayCount() {
		const result = await this.request<AkashicPlayList>(
			"GET",
			"/v1.0/plays?status%5B%5D=running&_limit=1&_count=1",
		);
		if (typeof result.totalCount !== "number" || !Number.isFinite(result.totalCount)) {
			throw new Error("Akashic System did not return a running Play count.");
		}
		return result.totalCount;
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

export class AkashicSystemRegistry {
	private readonly selectableClients: AkashicSystemClient[];
	private readonly clientsByUrl: Map<string, AkashicSystemClient>;
	private readonly legacyClient: AkashicSystemClient;

	constructor(settings: AkashicSystemSettings) {
		this.selectableClients = settings.systems.map((config) => new AkashicSystemClient(config));
		this.legacyClient = new AkashicSystemClient(settings.legacySystem);
		this.clientsByUrl = new Map(
			[...this.selectableClients, this.legacyClient].map((client) => [client.config.apiBaseUrl, client]),
		);
	}

	findBySystemUrl(systemUrl?: string) {
		if (!systemUrl) return this.legacyClient;
		return this.clientsByUrl.get(normalizeApiBaseUrl(systemUrl));
	}

	getClientForPlay(systemUrl?: string) {
		const client = this.findBySystemUrl(systemUrl);
		if (!client) {
			throw new fw.types.InternalServerError(`Akashic System client not found for ${systemUrl}`);
		}
		return client;
	}

	async chooseClientByRunningPlayCount() {
		// ScrambleはActive Instanceを使わないため、APIから取得できる実行中Play数を負荷の代理値にする。
		const loads = await Promise.all(
			this.selectableClients.map(async (client) => {
				try {
					return { client, count: await client.getRunningPlayCount() };
				} catch (error) {
					console.warn(`Failed to read Akashic System load: ${client.config.apiBaseUrl}`, error);
					return null;
				}
			}),
		);
		const availableLoads = loads.filter((load): load is NonNullable<typeof load> => load != null);
		if (availableLoads.length === 0) {
			throw new fw.types.ServiceUnavailableError("No Akashic System is available.");
		}
		const minimumCount = Math.min(...availableLoads.map((load) => load.count));
		const leastLoaded = availableLoads.filter((load) => load.count === minimumCount);
		return leastLoaded[Math.floor(Math.random() * leastLoaded.length)].client;
	}
}
