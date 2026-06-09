import * as http from "http";
import * as https from "https";

interface ApiResponse<T> {
	meta: {
		status: number;
		errorCode?: string | number;
		errorMessage?: string;
	};
	data: T;
}

interface GameDriveContent {
	id: string;
	title: string;
	description?: string;
	contentJsonPath?: string | null;
	state?: "ok" | "failed";
	trusted?: boolean;
}

interface GetContentResponse {
	content: GameDriveContent | null;
}

export interface GameDriveConfig {
	apiBaseUrl: string;
	apiKey?: string;
	contentCdnBaseUrl: string;
	contentId?: string;
}

export interface ResolvedGameDriveContent {
	contentId: string;
	title: string;
	description: string;
	contentUrl: string;
}

function normalizeBaseUrl(value: string) {
	return value.trim().replace(/\/+$/, "");
}

function optionalEnv(key: string) {
	const value = process.env[key]?.trim();
	return value || undefined;
}

function joinPublicUrl(baseUrl: string, objectPath: string) {
	const encodedPath = objectPath
		.replace(/^\/+/, "")
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return `${normalizeBaseUrl(baseUrl)}/${encodedPath}`;
}

export function loadGameDriveConfig(): GameDriveConfig {
	return {
		apiBaseUrl: normalizeBaseUrl(
			process.env.GAME_DRIVE_API_BASE_URL ?? "https://asia-northeast1-akashic-game-drive.cloudfunctions.net/api",
		),
		apiKey: optionalEnv("GAME_DRIVE_API_KEY"),
		contentCdnBaseUrl: normalizeBaseUrl(
			process.env.GAME_DRIVE_CONTENT_CDN_BASE_URL ?? "https://drive.akashic.shinonomekazan.com",
		),
		contentId: optionalEnv("SCRAMBLE_GAME_DRIVE_CONTENT_ID"),
	};
}

function requestJson<T>(url: string, options: https.RequestOptions): Promise<T> {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const transport = parsedUrl.protocol === "http:" ? http : https;
		const request = transport.request(
			parsedUrl,
			{
				...options,
				headers: {
					Accept: "application/json",
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
						reject(new Error(`Game Drive API returned invalid JSON: ${text.slice(0, 120)}`));
						return;
					}
					if (response.statusCode == null || response.statusCode < 200 || response.statusCode >= 300) {
						reject(new Error(`Game Drive API error: HTTP ${response.statusCode} ${text.slice(0, 120)}`));
						return;
					}
					resolve(json);
				});
			},
		);
		request.on("error", reject);
		request.end();
	});
}

export class GameDriveClient {
	readonly config: GameDriveConfig;

	constructor(config: GameDriveConfig = loadGameDriveConfig()) {
		this.config = config;
	}

	private request<T>(path: string) {
		return requestJson<ApiResponse<T>>(`${this.config.apiBaseUrl}${path}`, {
			method: "GET",
			headers: this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {},
		}).then((response) => response.data);
	}

	async resolveContent(contentId: string): Promise<ResolvedGameDriveContent> {
		const response = await this.request<GetContentResponse>(`/contents/${encodeURIComponent(contentId)}`);
		const content = response.content;
		if (!content) {
			throw new Error(`Game Drive content ${contentId} not found.`);
		}
		if (content.state && content.state !== "ok") {
			throw new Error(`Game Drive content ${contentId} is not ready: ${content.state}`);
		}
		if (content.trusted === false) {
			throw new Error(`Game Drive content ${contentId} is not trusted.`);
		}
		if (!content.contentJsonPath) {
			throw new Error(`Game Drive content ${contentId} has no content.json.`);
		}
		return {
			contentId: content.id,
			title: content.title,
			description: content.description ?? "",
			contentUrl: joinPublicUrl(this.config.contentCdnBaseUrl, content.contentJsonPath),
		};
	}
}
