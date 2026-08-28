import { Firestore, Timestamp } from "firebase-admin/firestore";
import * as fw from "../fw";
import { HoldPlace, Place, Play } from "../types/firestore";

export interface HoldPlacePlayInfo {
	holdPlaceId: string;
	placeId: string;
	holdUserId?: string;
	currentPlayId?: string;
	akashicPlayId?: string;
	systemUrl?: string;
	providerId?: string;
	contentCode?: string;
	contentUrl?: string;
	ownerUserId?: string;
	expireAt?: Timestamp;
}

function readHoldPlacePlaceId(holdPlaceId: string, holdPlaceData: Partial<HoldPlace>) {
	if (typeof holdPlaceData.placeId === "string" && holdPlaceData.placeId) {
		return holdPlaceData.placeId;
	}
	throw new fw.types.InternalServerError(`HoldPlace ${holdPlaceId} has no placeId`);
}

function normalizeHoldPlacePlayInfo(
	holdPlaceId: string,
	holdPlaceData: Partial<HoldPlace>,
	playData?: Partial<Play>,
): HoldPlacePlayInfo {
	return {
		holdPlaceId,
		placeId: readHoldPlacePlaceId(holdPlaceId, holdPlaceData),
		holdUserId: holdPlaceData.holdUserId,
		currentPlayId: holdPlaceData.currentPlayId,
		akashicPlayId: playData?.akashicPlayId ?? holdPlaceData.currentPlayId,
		systemUrl: playData?.systemUrl,
		providerId: playData?.providerId,
		contentCode: playData?.contentCode,
		contentUrl: playData?.contentUrl,
		ownerUserId: playData?.ownerUserId,
		expireAt: holdPlaceData.expireAt,
	};
}

export async function getCurrentHoldPlacePlayInfo(
	firestore: Firestore,
	input: {
		placeId: string;
		holdUserId?: string;
		requireOwner: boolean;
	},
): Promise<HoldPlacePlayInfo> {
	const placeSnap = await firestore.collection("places").doc(input.placeId).get();
	if (!placeSnap.exists) {
		throw new fw.types.NotFound(`Place with id ${input.placeId} not found`);
	}

	const placeData = placeSnap.data() as Partial<Place>;
	const currentHoldPlaceId = placeData.currentHoldPlaceId;
	if (!currentHoldPlaceId) {
		throw new fw.types.BadRequest("Place is not held");
	}

	const holdPlaceSnap = await firestore.collection("holdPlaces").doc(currentHoldPlaceId).get();
	if (!holdPlaceSnap.exists) {
		throw new fw.types.NotFound(`HoldPlace with id ${currentHoldPlaceId} not found`);
	}

	const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
	if (holdPlaceData.endedAt != null) {
		throw new fw.types.BadRequest("HoldPlace is already ended");
	}
	const holdUserId = holdPlaceData.holdUserId;
	if (input.requireOwner && holdUserId && holdUserId !== input.holdUserId) {
		throw new fw.types.Forbidden("HoldPlace is owned by another user");
	}

	const currentPlayId = holdPlaceData.currentPlayId;
	if (!currentPlayId) {
		return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData);
	}
	const playSnap = await firestore.collection("plays").doc(currentPlayId).get();
	if (!playSnap.exists) {
		throw new fw.types.InternalServerError(`Play with id ${currentPlayId} not found`);
	}
	return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData, playSnap.data() as Partial<Play>);
}

export async function getHoldPlacePlayInfo(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
	},
): Promise<HoldPlacePlayInfo> {
	const holdPlaceSnap = await firestore.collection("holdPlaces").doc(input.holdPlaceId).get();
	if (!holdPlaceSnap.exists) {
		throw new fw.types.NotFound(`HoldPlace with id ${input.holdPlaceId} not found`);
	}

	const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
	if (holdPlaceData.endedAt != null) {
		throw new fw.types.BadRequest("HoldPlace is already ended");
	}
	const playInfo = normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData);
	if (!playInfo.currentPlayId) {
		throw new fw.types.BadRequest("Play is not started");
	}
	const playSnap = await firestore.collection("plays").doc(playInfo.currentPlayId).get();
	if (!playSnap.exists) {
		throw new fw.types.InternalServerError(`Play with id ${playInfo.currentPlayId} not found`);
	}
	return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData, playSnap.data() as Partial<Play>);
}

export async function getExpirableHoldPlacePlayInfo(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		now: Timestamp;
	},
): Promise<HoldPlacePlayInfo | null> {
	const holdPlaceSnap = await firestore.collection("holdPlaces").doc(input.holdPlaceId).get();
	if (!holdPlaceSnap.exists) return null;

	const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
	if (holdPlaceData.endedAt != null) return null;
	if (holdPlaceData.expireAt === undefined) return null;
	if (holdPlaceData.expireAt.toMillis() > input.now.toMillis()) return null;

	const currentPlayId = holdPlaceData.currentPlayId;
	if (!currentPlayId) return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData);
	const playSnap = await firestore.collection("plays").doc(currentPlayId).get();
	if (!playSnap.exists) {
		throw new fw.types.InternalServerError(`Play with id ${currentPlayId} not found`);
	}
	return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData, playSnap.data() as Partial<Play>);
}
