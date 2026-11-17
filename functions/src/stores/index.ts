import { UserProfile } from "../types";
import { DocumentSnapshot, Firestore, Timestamp, FieldValue, Transaction } from "firebase-admin/firestore";
import { eraseUndefined } from "../utils";
import * as fw from "../fw";
import type { HoldPlacePlayInfo } from "../resolvers/holdPlaces";
import {
	AkashicSystemProperties,
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
	akashicPlayId?: string;
	systemUrl?: string;
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

function akashicSystemPropertiesRef(firestore: Firestore) {
	return firestore.collection("properties").doc("akashicSystem");
}

// properties/akashicSystemはシステム稼働前に手動で作成する前提のため、無い場合や値が不正な場合はエラーにする。
function readAkashicSystemProperties(snapshot: DocumentSnapshot): AkashicSystemProperties {
	if (!snapshot.exists) {
		throw new fw.types.InternalServerError("properties/akashicSystem not found");
	}
	const data = snapshot.data() as Partial<AkashicSystemProperties>;
	if (!Number.isInteger(data.playCount) || !Number.isInteger(data.playLimit)) {
		throw new fw.types.InternalServerError("properties/akashicSystem has invalid playCount or playLimit");
	}
	return data as AkashicSystemProperties;
}

// HoldPlaceが確保している枠を、同じトランザクション内で解放する。
function releasePlaySlotInTransaction(
	firestore: Firestore,
	transaction: Transaction,
	holdPlaceData: Partial<HoldPlace>,
) {
	if (!holdPlaceData.playSlotReserved) return {};
	// playCountの減算。対になる加算はreservePlaySlot（Playの作成時）で行う。
	transaction.update(akashicSystemPropertiesRef(firestore), {
		playCount: FieldValue.increment(-1),
	});
	return { playSlotReserved: FieldValue.delete() };
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
		now: Timestamp;
		allowMissing?: boolean;
		allowAlreadyEnded?: boolean;
		requireSameCurrentPlayId?: boolean;
		expectedCurrentPlayId?: string;
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

	const holdUserId = holdPlaceData.holdUserId;
	if (input.requireOwner && holdUserId && holdUserId !== input.holdUserId) {
		throw new fw.types.Forbidden("HoldPlace is owned by another user");
	}

	if (input.expireAtRequired != null) {
		if (holdPlaceData.expireAt === undefined) return null;
		if (holdPlaceData.expireAt.toMillis() > input.expireAtRequired.toMillis()) return null;
	}

	const now = input.now;
	const placeId = input.placeId ?? holdPlaceData.placeId;
	const currentPlayId = holdPlaceData.currentPlayId;
	if (input.requireSameCurrentPlayId && currentPlayId !== input.expectedCurrentPlayId) return null;
	const playRef = currentPlayId ? firestore.collection("plays").doc(currentPlayId) : undefined;
	const playSnap = playRef ? await transaction.get(playRef) : undefined;
	const playData = playSnap?.exists ? (playSnap.data() as Partial<Play>) : undefined;
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

	const releasedSlot = releasePlaySlotInTransaction(firestore, transaction, holdPlaceData);
	await transaction.update(
		holdPlaceRef,
		eraseUndefined({
			endedAt: now,
			expireAt: FieldValue.delete(),
			updatedAt: now,
			...releasedSlot,
		}),
	);

	return {
		holdPlaceId: holdPlaceRef.id,
		placeId,
		currentPlayId,
		akashicPlayId: playData?.akashicPlayId,
		systemUrl: playData?.systemUrl,
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
		holdUserId: holdPlaceData.holdUserId,
		currentPlayId: holdPlaceData.currentPlayId,
		akashicPlayId: playData?.akashicPlayId,
		systemUrl: playData?.systemUrl,
		providerId: playData?.providerId,
		contentCode: playData?.contentCode,
		contentUrl: playData?.contentUrl,
		ownerUserId: playData?.ownerUserId,
		expireAt: holdPlaceData.expireAt,
	};
}

export function storeUser(firestore: Firestore, user: Omit<UserProfile, "createdAt" | "updatedAt">, now: Timestamp) {
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
					updatedAt: now,
				}),
			);
		} else {
			// Create new user
			transaction.set(
				userDoc,
				eraseUndefined({
					name: user.name,
					photoURL: user.photoURL,
					createdAt: now,
					updatedAt: now,
				}),
			);
		}
	});
}

export function updateUser(firestore: Firestore, user: Omit<UserProfile, "createdAt" | "updatedAt">, now: Timestamp) {
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
				updatedAt: now,
			}),
		);
	});
}

export function holdPlace(
	firestore: Firestore,
	input: {
		placeId: string;
		holdUserId?: string;
		now: Timestamp;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const placeRef = firestore.collection("places").doc(input.placeId);
		const placeSnap = await transaction.get(placeRef);
		if (!placeSnap.exists) {
			throw new fw.types.NotFound(`Place with id ${input.placeId} not found`);
		}

		const placeData = placeSnap.data() as Partial<Place>;
		const currentHoldPlaceId = placeData.currentHoldPlaceId;
		if (currentHoldPlaceId) {
			throw new fw.types.Duplicate("Place is already held");
		}

		const behaviours = Array.isArray(placeData.behaviours) ? placeData.behaviours : [];
		const now = input.now;
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
		now: Timestamp;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const placeRef = firestore.collection("places").doc(input.placeId);
		const placeSnap = await transaction.get(placeRef);
		if (!placeSnap.exists) {
			throw new fw.types.NotFound(`Place with id ${input.placeId} not found`);
		}

		const placeData = placeSnap.data() as Partial<Place>;
		const currentHoldPlaceId = placeData.currentHoldPlaceId;
		if (!currentHoldPlaceId) {
			throw new fw.types.BadRequest("Place is not held");
		}

		return endHoldPlaceTransaction(firestore, transaction, {
			holdPlaceId: currentHoldPlaceId,
			holdUserId: input.holdUserId,
			requireOwner: true,
			placeId: input.placeId,
			now: input.now,
		});
	});
}

export function expireHoldPlace(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		now: Timestamp;
		currentPlayId?: string;
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
			requireSameCurrentPlayId: true,
			expectedCurrentPlayId: input.currentPlayId,
		});
	});
}

/**
 * Play作成前に、Scrambleの同時プレイ数の枠を確保する。
 * 枠を確保できた場合はtrue、既にPlayがあるHoldPlaceでは確保せずfalseを返す。
 * 別のリクエストがPlayを作成中（枠を確保済み）の場合は、Akashic SystemのPlayを重複して作らないようエラーにする。
 */
export function reservePlaySlot(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		holdUserId?: string;
		now: Timestamp;
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
		const holdUserId = holdPlaceData.holdUserId;
		if (holdUserId && holdUserId !== input.holdUserId) {
			throw new fw.types.Forbidden("HoldPlace is owned by another user");
		}
		if (holdPlaceData.currentPlayId) return false;
		if (holdPlaceData.playSlotReserved) {
			throw new fw.types.Duplicate("Play is being created");
		}

		// properties/akashicSystemは全ての開始リクエストが読み書きするため、
		// トランザクションの競合を減らすよう、HoldPlaceの判定で枠を確保すると決まった後に読む。
		const propertiesRef = akashicSystemPropertiesRef(firestore);
		const properties = readAkashicSystemProperties(await transaction.get(propertiesRef));
		if (properties.playCount >= properties.playLimit) {
			throw new fw.types.ServiceUnavailableError("Play limit reached");
		}

		// playCountの加算。対になる減算はreleasePlaySlotInTransaction（Playの終了時や作成失敗時）で、FieldValue.increment(-1)で行う。
		// 加算だけincrementを使わないのは、直前の上限判定で読んだplayCountに+1して書き込むため。
		await transaction.update(propertiesRef, {
			playCount: properties.playCount + 1,
		});
		await transaction.update(holdPlaceRef, {
			playSlotReserved: true,
			updatedAt: input.now,
		});
		return true;
	});
}

/**
 * Playの作成に失敗した時、reservePlaySlotで確保した枠を解放する。
 * Playが登録済みの場合は、Playの終了時に解放するためここでは何もしない。
 */
export function releasePlaySlot(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		now: Timestamp;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const holdPlaceRef = firestore.collection("holdPlaces").doc(input.holdPlaceId);
		const holdPlaceSnap = await transaction.get(holdPlaceRef);
		if (!holdPlaceSnap.exists) return;

		const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
		if (holdPlaceData.currentPlayId) return;
		const releasedSlot = releasePlaySlotInTransaction(firestore, transaction, holdPlaceData);
		if (Object.keys(releasedSlot).length === 0) return;
		await transaction.update(holdPlaceRef, {
			updatedAt: input.now,
			...releasedSlot,
		});
	});
}

export function setHoldPlacePlay(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		holdUserId?: string;
		akashicPlayId: string;
		systemUrl: string;
		providerId: string;
		contentCode: string;
		contentUrl: string;
		ownerUserId: string;
		now: Timestamp;
	},
) {
	const playRef = firestore.collection("plays").doc();
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
		const holdUserId = holdPlaceData.holdUserId;
		if (holdUserId && holdUserId !== input.holdUserId) {
			throw new fw.types.Forbidden("HoldPlace is owned by another user");
		}
		const currentPlayId = holdPlaceData.currentPlayId;
		// Playを登録するのは枠を確保した1リクエストだけなので通常ここには来ないが、念のため既存のPlayを返す。
		if (currentPlayId) {
			const playSnap = await transaction.get(firestore.collection("plays").doc(currentPlayId));
			if (!playSnap.exists) {
				throw new fw.types.InternalServerError(`Play with id ${currentPlayId} not found`);
			}
			return normalizeHoldPlacePlayInfo(holdPlaceRef.id, holdPlaceData, playSnap.data() as Partial<Play>);
		}

		// 通常は起きないが、枠を確保していない状態でPlayを登録してplayCountとずれることを防ぐ。
		if (!holdPlaceData.playSlotReserved) {
			throw new fw.types.Duplicate("Play slot is not reserved");
		}

		const now = input.now;
		const behaviours = Array.isArray(holdPlaceData.behaviours) ? holdPlaceData.behaviours : [];
		const play: Play = {
			akashicPlayId: input.akashicPlayId,
			systemUrl: input.systemUrl,
			placeId: readHoldPlacePlaceId(holdPlaceRef.id, holdPlaceData),
			holdPlaceId: holdPlaceRef.id,
			providerId: input.providerId,
			contentCode: input.contentCode,
			contentUrl: input.contentUrl,
			state: "playing",
			ownerUserId: input.ownerUserId,
			joinedPlayerIds: [],
			defaultPermission: resolveDefaultPermission(behaviours),
			expireAt: holdPlaceData.expireAt,
			createdAt: now,
			updatedAt: now,
		};
		const nextHoldPlaceData = {
			currentPlayId: playRef.id,
			updatedAt: now,
		};
		await transaction.set(playRef, eraseUndefined(play));
		await transaction.update(holdPlaceRef, nextHoldPlaceData);

		return normalizeHoldPlacePlayInfo(
			holdPlaceRef.id,
			{
				...holdPlaceData,
				...nextHoldPlaceData,
			},
			play,
		);
	});
}

export function clearHoldPlacePlay(
	firestore: Firestore,
	input: {
		holdPlaceId: string;
		holdUserId?: string;
		requireOwner: boolean;
		now: Timestamp;
	},
) {
	return firestore.runTransaction(async (transaction) => {
		const holdPlaceRef = firestore.collection("holdPlaces").doc(input.holdPlaceId);
		const holdPlaceSnap = await transaction.get(holdPlaceRef);
		if (!holdPlaceSnap.exists) {
			throw new fw.types.NotFound(`HoldPlace with id ${input.holdPlaceId} not found`);
		}

		const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
		const holdUserId = holdPlaceData.holdUserId;
		if (input.requireOwner && holdUserId && holdUserId !== input.holdUserId) {
			throw new fw.types.Forbidden("HoldPlace is owned by another user");
		}

		const currentPlayId = holdPlaceData.currentPlayId;
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
				updatedAt: input.now,
			});
		}
		// 枠はPlayが登録済みの場合だけ解放する。
		// Playの作成中（枠は確保済みだがcurrentPlayIdが無い）の枠は、作成しているリクエスト自身が解放する。
		// ここで解放すると、その後に別のリクエストが確保した枠を、作成中のリクエストが失敗時に解放してしまうため。
		const releasedSlot = currentPlayId ? releasePlaySlotInTransaction(firestore, transaction, holdPlaceData) : {};
		await transaction.update(holdPlaceRef, {
			currentPlayId: FieldValue.delete(),
			updatedAt: input.now,
			...releasedSlot,
		});
		return playInfo;
	});
}
