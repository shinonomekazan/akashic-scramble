import { GameDriveClient, loadGameDriveConfig } from "./gameDrive";

export interface PlayContentInfo {
	providerId: string;
	contentCode: string;
	title: string;
	description: string;
	contentUrl: string;
}

export interface PlayContentRef {
	providerId?: string;
	contentCode?: string;
	contentUrl?: string;
}

export const GAME_DRIVE_PROVIDER_ID = "akashic-game-drive";

// Scrambleでゲームを選べるようになるまでの仮の固定コンテンツ。
// Game Drive上のrocket-gameを指す。content.jsonのURLはアップロードごとに変わるため、コンテンツIDだけを持ち、URLはGame Driveから引く。
export const DEFAULT_SCRAMBLE_PLAY_CONTENT_REF: PlayContentRef = {
	providerId: GAME_DRIVE_PROVIDER_ID,
	contentCode: "F9bWGH7aN0NyiNXFnYqw",
};

export function buildAkashicGameCode(holdPlaceId: string, contentCode: string) {
	return `scramble-${holdPlaceId}-${contentCode}`;
}

export async function resolvePlayContentInfo(contentRef: PlayContentRef): Promise<PlayContentInfo> {
	if (contentRef.providerId !== GAME_DRIVE_PROVIDER_ID || !contentRef.contentCode) {
		// 以前は旧サーバー上のrocket-gameを指すPlayもあったが、そのcontent.jsonはもう無いため、Game Driveのコンテンツだけを扱う。
		throw new Error(`Unsupported play content: ${contentRef.providerId ?? "(none)"}`);
	}

	const content = await new GameDriveClient(loadGameDriveConfig()).resolveContent(contentRef.contentCode);
	return {
		providerId: GAME_DRIVE_PROVIDER_ID,
		contentCode: content.contentId,
		title: content.title,
		description: content.description,
		// 開始済みのPlayは、開始時に記録したcontent.jsonを使い続ける。途中でGame Drive側が更新されても切り替わらないようにするため。
		contentUrl: contentRef.contentUrl ?? content.contentUrl,
	};
}
