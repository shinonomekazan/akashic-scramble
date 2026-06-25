import { GameDriveClient, loadGameDriveConfig } from "./gameDrive";

export interface PlayContentInfo {
	providerId: string;
	contentCode: string;
	title: string;
	description: string;
	contentUrl: string;
	inputAdapter: string;
}

export interface PlayContentRef {
	providerId?: string;
	contentCode?: string;
	contentUrl?: string;
}

// Temporary fixed content until Scramble has Game Drive content selection.
export const DEFAULT_SCRAMBLE_PLAY_CONTENT: PlayContentInfo = {
	providerId: "akashic-system",
	contentCode: "rocket-game",
	title: "Rocket Game",
	description: "",
	contentUrl: "/contents/rocket-game/content.json",
	inputAdapter: "rocket-game",
};

export function buildAkashicGameCode(holdPlaceId: string, contentCode: string) {
	return `scramble-${holdPlaceId}-${contentCode}`;
}

export async function resolvePlayContentInfo(contentRef: PlayContentRef = {}): Promise<PlayContentInfo> {
	if (contentRef.providerId === "akashic-game-drive" && contentRef.contentCode) {
		const content = await new GameDriveClient(loadGameDriveConfig()).resolveContent(contentRef.contentCode);
		return {
			providerId: "akashic-game-drive",
			contentCode: content.contentId,
			title: content.title,
			description: content.description,
			contentUrl: contentRef.contentUrl ?? content.contentUrl,
			inputAdapter: DEFAULT_SCRAMBLE_PLAY_CONTENT.inputAdapter,
		};
	}

	return {
		...DEFAULT_SCRAMBLE_PLAY_CONTENT,
		contentCode: contentRef.contentCode ?? DEFAULT_SCRAMBLE_PLAY_CONTENT.contentCode,
		contentUrl: contentRef.contentUrl ?? DEFAULT_SCRAMBLE_PLAY_CONTENT.contentUrl,
	};
}
