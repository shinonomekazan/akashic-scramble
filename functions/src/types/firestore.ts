import { Timestamp } from "firebase-admin/firestore";

// Note: 予約必須とか、ユーザー確保不可とかを後日追加
export type PlaceBehaviourType = "holdableTime" | "connectionLimit" | "defaultPermission";

export type PlayTokenState = "active" | "used";

/**
 * そのプレイに対する権利。
 * - Player: 操作権あり
 * - Viewer: 閲覧のみ
 * 権限は細かくはGuest ViewerやJoined Player、Administrator等があるが、ここで定義されるのは2値のみ。
 */
export type PlayPermission = "player" | "viewer";

export interface BasePlaceBehaviour {
	type: PlaceBehaviourType;
}

/**
 * 保持可能な時間の制限
 */
export interface PlaceHoldableTimeBehaviour extends BasePlaceBehaviour {
	type: "holdableTime";
	time: number;
}

/**
 * 同時接続数の制限
 */
export interface PlaceConnectionLimitBehaviour extends BasePlaceBehaviour {
	type: "connectionLimit";
	limit: number;
}

/**
 * そのPlaceで作られるPlayのデフォルトパーミッション
 */
export interface PlaceDefaultPermissionBehaviour extends BasePlaceBehaviour {
	type: "defaultPermission";
	permission: PlayPermission;
}

export type PlaceBehaviour =
	| PlaceHoldableTimeBehaviour
	| PlaceConnectionLimitBehaviour
	| PlaceDefaultPermissionBehaviour;

export interface Place {
	x: number;

	y: number;

	name: string;

	behaviours: PlaceBehaviour[];

	/**
	 * そのPlaceを保持しているHoldPlaceのID。
	 * HoldPlaceが存在しない場合はundefinedで、undefinedであれば空き地であることが保証される。
	 */
	currentHoldPlaceId?: string;

	createdAt: Timestamp;

	updatedAt: Timestamp;

	// Note: currentDefaultPermission等を定義し、Hold Userが上書きできるようにするべき？
	// Note: 後日予約に関する情報を入れる必要があると思うが、ReservedPlace等別のコレクションにするべきかも？
}

export interface HoldPlace {
	placeId: string;

	/**
	 * そのHoldPlaceのbehaviours。
	 * 通常Placeのbehavioursと同じ値が入るが、履歴管理の意味で非正規化して保持する。
	 */
	behaviours: PlaceBehaviour[];

	/**
	 * そのHoldPlaceを保有しているユーザーのID。
	 * そのHoldPlaceを保有しているユーザーがいない場合はundefined。
	 * この値が無い時は、システムが保有しているという扱いになる。
	 */
	holdUserId?: string;

	/**
	 * 現在そのHoldPlaceでプレーされているPlayのID。
	 */
	currentPlayId?: string;

	/**
	 * HoldPlaceの有効期限。
	 * Timestamp型だが、分が最小単位であることが保証される。
	 * この値が存在しない場合、無期限か、時限以外の権利で保有されることを意味する。
	 */
	expireAt?: Timestamp;

	/**
	 * そのHoldPlaceのHoldが終了した日時。
	 * 手動で終了した場合等、expireAtとは異なる値が入ることがある。
	 */
	endedAt?: Timestamp;

	createdAt: Timestamp;

	updatedAt: Timestamp;
}

export type PlayState = "playing" | "ended";

export interface Play {
	/**
	 * Scrambleとは別にAkashic System側で発行されたPlayのID。
	 */
	akashicPlayId: string;

	/**
	 * Akashic Playを作成したAkashic System APIのベースURL。
	 */
	systemUrl: string;

	/**
	 * そのPlayが実行されているPlaceのID。
	 */
	placeId: string;

	/**
	 * そのPlayが実行されているHoldPlaceのID。
	 */
	holdPlaceId: string;

	/**
	 * コンテンツを提供しているプロバイダーのID。
	 * 初期はakashic-game-driveのみの想定。
	 */
	providerId: string;

	/**
	 * そのコンテンツをプロバイダー単位で一意に識別するためのコード。
	 * 初期はakashic-game-driveのcontentId。
	 */
	contentCode: string;

	/**
	 * コンテンツのダウンロードURL。
	 * 同一のproviderId、同一のcontentCodeでも、バージョン等が違えば異なる事がある。
	 */
	contentUrl: string;

	/**
	 * プレイの状態。
	 */
	state: PlayState;

	/**
	 * そのプレイのオーナーであるユーザーのID。
	 * 基本的に値があるが、システムがオーナーである場合はundefined。
	 */
	ownerUserId?: string;

	/**
	 * そのプレイに現在参加しているユーザーIDの一覧。
	 * 履歴として残るものではない点に注意。
	 * 正確にはJoinedPlayerUserIdsとなるが、冗長性を避けるため本名称としている。
	 */
	joinedPlayerIds: string[];

	/**
	 * そのプレイを見たUserのデフォルトパーミッション。
	 * プレイが終了している場合や、Guestの場合はこの値に限らずviewerになる。
	 */
	defaultPermission: PlayPermission;

	/**
	 * そのプレイの有効期間。
	 * Timestamp型だが、分が最小単位であることが保証される。
	 */
	expireAt?: Timestamp;

	createdAt: Timestamp;

	updatedAt: Timestamp;
}

export interface PlayToken {
	// Note: 親ドキュメントから取得可能なため不要
	// playId: string;
	// holdPlaceId: string;

	userId: string;

	token: string;

	permission: PlayPermission;

	serverUrl: string;

	state: PlayTokenState;

	createdAt: Timestamp;

	updatedAt: Timestamp;
}

export type WithId<T> = T & {
	id: string;
};
