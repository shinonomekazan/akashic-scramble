import { UserProfile } from "../types";
import { Firestore, Timestamp, FieldValue, Transaction } from "firebase-admin/firestore";
import { eraseUndefined } from "../utils";
import * as fw from "../fw";
import {
	HoldPlace,
	Place,
	PlaceBehaviour,
	PlaceDefaultPermissionBehaviour,
	PlaceHoldableTimeBehaviour,
	Play,
	PlayPermission,
} from "../types/firestore";

export interface EndedHoldPlaceResult {
	holdPlaceId: string;
	placeId?: string;
	currentPlayId?: string;
}

export interface HoldPlacePlayInfo {
	holdPlaceId: string;
	placeId: string;
	holdUserId?: string;
	currentPlayId?: string;
	gameCode?: string;
	gameTitle?: string;
	gameDescription?: string;
	contentUrl?: string;
	inputAdapter?: string;
	ownerUserId?: string;
	expireAt?: Timestamp;
}

// PlaceBehaviour から holdableTime バリアントを絞り込むための型ガード
function isPlaceHoldableTimeBehaviour(behaviour: PlaceBehaviour): behaviour is PlaceHoldableTimeBehaviour {
	return behaviour.type === "holdableTime";
}

function isPlaceDefaultPermissionBehaviour(behaviour: PlaceBehaviour): behaviour is PlaceDefaultPermissionBehaviour {
	return behaviour.type === "defaultPermission";
}

function resolveDefaultPermission(behaviours: PlaceBehaviour[]): PlayPermission {
	return behaviours.find(isPlaceDefaultPermissionBehaviour)?.permission ?? "viewer";
}

function resolveHoldExpireAt(behaviours: PlaceBehaviour[], now: Timestamp) {
	const holdableBehaviour = behaviours.find(isPlaceHoldableTimeBehaviour);
	if (!holdableBehaviour) return undefined;
	const time = holdableBehaviour.time;
	if (typeof time !== "number" || !Number.isFinite(time) || time <= 0) return undefined;
	return Timestamp.fromMillis(now.toMillis() + time);
}

async function endHoldPlaceTransaction(
	firestore: Firestore,
	transaction: Transaction,
	input: {
		holdPlaceId: string;
		holdUserId?: string;
		requireOwner: boolean;
		placeId?: string;
		expireAtRequired?: Timestamp;
		now?: Timestamp;
		allowMissing?: boolean;
		allowAlreadyEnded?: boolean;
	},
) {
	const holdPlaceRef = firestore.collection("holdPlaces").doc(input.holdPlaceId);
	const holdPlaceSnap = await transaction.get(holdPlaceRef);
	if (!holdPlaceSnap.exists) {
		if (input.allowMissing) return null;
		throw new fw.types.NotFound(`HoldPlace with id ${input.holdPlaceId} not found`);
	}

	const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
	if (holdPlaceData.endedAt != null) {
		if (input.allowAlreadyEnded) return null;
		throw new fw.types.Duplicate("HoldPlace is already ended");
	}

	if (input.requireOwner && holdPlaceData.holdUserId && holdPlaceData.holdUserId !== input.holdUserId) {
		throw new fw.types.Forbidden("HoldPlace is owned by another user");
	}

	if (input.expireAtRequired != null) {
		if (holdPlaceData.expireAt === undefined) return null;
		if (holdPlaceData.expireAt.toMillis() > input.expireAtRequired.toMillis()) return null;
	}

	const now = input.now ?? Timestamp.now();
	const placeId = input.placeId ?? holdPlaceData.placeId;
	const currentPlayId = typeof holdPlaceData.currentPlayId === "string" ? holdPlaceData.currentPlayId : undefined;
	const playRef = currentPlayId ? firestore.collection("plays").doc(currentPlayId) : undefined;
	const playSnap = playRef ? await transaction.get(playRef) : undefined;
	if (placeId != undefined) {
		const placeRef = firestore.collection("places").doc(placeId);
		const placeSnap = await transaction.get(placeRef);
		if (placeSnap.exists) {
			const placeData = placeSnap.data() as Partial<Place>;
			if (placeData.currentHoldPlaceId === holdPlaceRef.id) {
				await transaction.update(placeRef, {
					currentHoldPlaceId: FieldValue.delete(),
					updatedAt: now,
				});
			}
		}
	}

	if (playRef && playSnap?.exists) {
		await transaction.update(playRef, {
			state: "ended",
			updatedAt: now,
		});
	}

	await transaction.update(
		holdPlaceRef,
		eraseUndefined({
			endedAt: now,
			expireAt: FieldValue.delete(),
			updatedAt: now,
		}),
	);

	return {
		holdPlaceId: holdPlaceRef.id,
		placeId,
		currentPlayId,
	};
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
		holdUserId: typeof holdPlaceData.holdUserId === "string" ? holdPlaceData.holdUserId : undefined,
		currentPlayId: typeof holdPlaceData.currentPlayId === "string" ? holdPlaceData.currentPlayId : undefined,
		gameCode: typeof playData?.gameCode === "string" ? playData.gameCode : undefined,
		gameTitle: typeof playData?.title === "string" ? playData.title : undefined,
		gameDescription: typeof playData?.description === "string" ? playData.description : undefined,
		contentUrl: typeof playData?.contentUrl === "string" ? playData.contentUrl : undefined,
		inputAdapter: typeof playData?.inputAdapter === "string" ? playData.inputAdapter : undefined,
		ownerUserId: typeof playData?.ownerUserId === "string" ? playData.ownerUserId : undefined,
		expireAt: holdPlaceData.expireAt,
	};
}

export function storeUser(firestore: Firestore, user: Omit<UserProfile, "createdAt" | "updatedAt">) {
	return firestore.runTransaction(async (transaction) => {
		const userDoc = firestore.collection("users").doc(user.uid);
		const doc = await transaction.get(userDoc);
		if (doc.exists) {
			// Update existing user
			transaction.update(
				userDoc,
				eraseUndefined({
					name: user.name,
					photoURL: user.photoURL,
					updatedAt: Timestamp.now(),
				}),
			);
		} else {
			// Create new user
			transaction.set(
				userDoc,
				eraseUndefined({
					name: user.name,
					photoURL: user.photoURL,
					createdAt: Timestamp.now(),
					updatedAt: Timestamp.now(),
				}),
			);
		}
	});
}

export function updateUser(firestore: Firestore, user: Omit<UserProfile, "createdAt" | "updatedAt">) {
	return firestore.runTransaction(async (transaction) => {
		const userDoc = firestore.collection("users").doc(user.uid);
		const snapshot = await transaction.get(userDoc);
		if (!snapshot.exists) {
			throw new fw.types.NotFound(`User with id ${user.uid} not found`);
		}
		await transaction.update(
			userDoc,
			eraseUndefined({
				name: user.name,
				photoURL: user.photoURL,
				updatedAt: Timestamp.now(),
			}),
		);
	});
}

export function holdPlace(
	firestore: Firestore,
	input: {
		placeId: string;
		holdUserId?: string;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const placeRef = firestore.collection("places").doc(input.placeId);
		const placeSnap = await transaction.get(placeRef);
		if (!placeSnap.exists) {
			throw new fw.types.NotFound(`Place with id ${input.placeId} not found`);
		}

		const placeData = placeSnap.data() as Partial<Place>;
		const currentHoldPlaceId =
			typeof placeData.currentHoldPlaceId === "string" ? placeData.currentHoldPlaceId : undefined;
		if (currentHoldPlaceId) {
			throw new fw.types.Duplicate("Place is already held");
		}

		const behaviours = Array.isArray(placeData.behaviours) ? placeData.behaviours : [];
		const now = Timestamp.now();
		const holdPlaceRef = firestore.collection("holdPlaces").doc();
		const holdPlace: HoldPlace = {
			placeId: input.placeId,
			behaviours,
			holdUserId: input.holdUserId,
			expireAt: resolveHoldExpireAt(behaviours, now),
			createdAt: now,
			updatedAt: now,
		};

		await transaction.set(holdPlaceRef, eraseUndefined(holdPlace));
		await transaction.update(
			placeRef,
			eraseUndefined({
				currentHoldPlaceId: holdPlaceRef.id,
				updatedAt: now,
			}),
		);

		return holdPlaceRef.id;
	});
}

export function releaseHoldPlace(
	firestore: Firestore,
	input: {
		placeId: string;
		holdUserId?: string;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const placeRef = firestore.collection("places").doc(input.placeId);
		const placeSnap = await transaction.get(placeRef);
		if (!placeSnap.exists) {
			throw new fw.types.NotFound(`Place with id ${input.placeId} not found`);
		}

		const placeData = placeSnap.data() as Partial<Place>;
		const currentHoldPlaceId =
			typeof placeData.currentHoldPlaceId === "string" ? placeData.currentHoldPlaceId : undefined;
		if (!currentHoldPlaceId) {
			throw new fw.types.BadRequest("Place is not held");
		}

		return endHoldPlaceTransaction(firestore, transaction, {
			holdPlaceId: currentHoldPlaceId,
			holdUserId: input.holdUserId,
			requireOwner: true,
			placeId: input.placeId,
			now: Timestamp.now(),
		});
	});
}

export function expireHoldPlace(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		now: Timestamp;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		return endHoldPlaceTransaction(firestore, transaction, {
			holdPlaceId: input.holdPlaceId,
			requireOwner: false,
			expireAtRequired: input.now,
			now: input.now,
			allowMissing: true,
			allowAlreadyEnded: true,
		});
	});
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
	const currentHoldPlaceId =
		typeof placeData.currentHoldPlaceId === "string" ? placeData.currentHoldPlaceId : undefined;
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
	if (input.requireOwner && holdPlaceData.holdUserId && holdPlaceData.holdUserId !== input.holdUserId) {
		throw new fw.types.Forbidden("HoldPlace is owned by another user");
	}

	const currentPlayId = typeof holdPlaceData.currentPlayId === "string" ? holdPlaceData.currentPlayId : undefined;
	if (!currentPlayId) {
		return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData);
	}
	const playSnap = await firestore.collection("plays").doc(currentPlayId).get();
	if (!playSnap.exists) {
		throw new fw.types.InternalServerError(`Play with id ${currentPlayId} not found`);
	}
	return normalizeHoldPlacePlayInfo(holdPlaceSnap.id, holdPlaceData, playSnap.data() as Partial<Play>);
}

export function setHoldPlacePlay(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		holdUserId?: string;
		systemPlayId: string;
		providerId: string;
		contentCode: string;
		gameCode: string;
		gameTitle: string;
		gameDescription: string;
		contentUrl: string;
		inputAdapter: string;
		ownerUserId: string;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const holdPlaceRef = firestore.collection("holdPlaces").doc(input.holdPlaceId);
		const holdPlaceSnap = await transaction.get(holdPlaceRef);
		if (!holdPlaceSnap.exists) {
			throw new fw.types.NotFound(`HoldPlace with id ${input.holdPlaceId} not found`);
		}

		const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
		if (holdPlaceData.endedAt != null) {
			throw new fw.types.BadRequest("HoldPlace is already ended");
		}
		if (holdPlaceData.holdUserId && holdPlaceData.holdUserId !== input.holdUserId) {
			throw new fw.types.Forbidden("HoldPlace is owned by another user");
		}
		const currentPlayId = typeof holdPlaceData.currentPlayId === "string" ? holdPlaceData.currentPlayId : undefined;
		if (currentPlayId) {
			const playSnap = await transaction.get(firestore.collection("plays").doc(currentPlayId));
			if (!playSnap.exists) {
				throw new fw.types.InternalServerError(`Play with id ${currentPlayId} not found`);
			}
			return normalizeHoldPlacePlayInfo(holdPlaceRef.id, holdPlaceData, playSnap.data() as Partial<Play>);
		}

		const now = Timestamp.now();
		const behaviours = Array.isArray(holdPlaceData.behaviours) ? holdPlaceData.behaviours : [];
		const play: Play = {
			placeId: readHoldPlacePlaceId(holdPlaceRef.id, holdPlaceData),
			holdPlaceId: holdPlaceRef.id,
			providerId: input.providerId,
			contentCode: input.contentCode,
			contentUrl: input.contentUrl,
			gameCode: input.gameCode,
			title: input.gameTitle,
			description: input.gameDescription,
			inputAdapter: input.inputAdapter,
			state: "playing",
			ownerUserId: input.ownerUserId,
			joinedPlayerIds: [],
			defaultPermission: resolveDefaultPermission(behaviours),
			expireAt: holdPlaceData.expireAt,
			createdAt: now,
			updatedAt: now,
		};
		const nextHoldPlaceData = {
			currentPlayId: input.systemPlayId,
			updatedAt: now,
		};
		await transaction.set(firestore.collection("plays").doc(input.systemPlayId), eraseUndefined(play));
		await transaction.update(holdPlaceRef, nextHoldPlaceData);

		return normalizeHoldPlacePlayInfo(holdPlaceRef.id, {
			...holdPlaceData,
			...nextHoldPlaceData,
		}, play);
	});
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

export function clearHoldPlacePlay(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		holdUserId?: string;
		requireOwner: boolean;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const holdPlaceRef = firestore.collection("holdPlaces").doc(input.holdPlaceId);
		const holdPlaceSnap = await transaction.get(holdPlaceRef);
		if (!holdPlaceSnap.exists) {
			throw new fw.types.NotFound(`HoldPlace with id ${input.holdPlaceId} not found`);
		}

		const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
		if (input.requireOwner && holdPlaceData.holdUserId && holdPlaceData.holdUserId !== input.holdUserId) {
			throw new fw.types.Forbidden("HoldPlace is owned by another user");
		}

		const currentPlayId = typeof holdPlaceData.currentPlayId === "string" ? holdPlaceData.currentPlayId : undefined;
		const playRef = currentPlayId ? firestore.collection("plays").doc(currentPlayId) : undefined;
		const playSnap = playRef ? await transaction.get(playRef) : undefined;
		const playInfo = normalizeHoldPlacePlayInfo(
			holdPlaceRef.id,
			holdPlaceData,
			playSnap?.exists ? (playSnap.data() as Partial<Play>) : undefined,
		);
		if (playRef && playSnap?.exists) {
			await transaction.update(playRef, {
				state: "ended",
				updatedAt: Timestamp.now(),
			});
		}
		await transaction.update(holdPlaceRef, {
			currentPlayId: FieldValue.delete(),
			updatedAt: Timestamp.now(),
		});
		return playInfo;
	});
}
