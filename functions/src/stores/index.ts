import { UserProfile } from "../types";
import { Firestore, Timestamp, FieldValue, Transaction } from "firebase-admin/firestore";
import { eraseUndefined } from "../utils";
import * as fw from "../fw";
import { HoldPlace, Place, PlaceBehaviour, PlaceHoldableTimeBehaviour } from "../types/firestore";

// PlaceBehaviour から holdableTime バリアントを絞り込むための型ガード
function isPlaceHoldableTimeBehaviour(behaviour: PlaceBehaviour): behaviour is PlaceHoldableTimeBehaviour {
	return behaviour.type === "holdableTime";
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
		if (input.allowMissing) return false;
		throw new fw.types.NotFound(`HoldPlace with id ${input.holdPlaceId} not found`);
	}

	const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
	if (holdPlaceData.endedAt != null) {
		if (input.allowAlreadyEnded) return false;
		throw new fw.types.Duplicate("HoldPlace is already ended");
	}

	if (input.requireOwner && holdPlaceData.holdUserId && holdPlaceData.holdUserId !== input.holdUserId) {
		throw new fw.types.Forbidden("HoldPlace is owned by another user");
	}

	if (input.expireAtRequired != null) {
		if (holdPlaceData.expireAt === undefined) return false;
		if (holdPlaceData.expireAt.toMillis() > input.expireAtRequired.toMillis()) return false;
	}

	const now = input.now ?? Timestamp.now();
	const placeId = input.placeId ?? holdPlaceData.placeId;
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

	await transaction.update(
		holdPlaceRef,
		eraseUndefined({
			endedAt: now,
			expireAt: FieldValue.delete(),
			updatedAt: now,
		}),
	);

	return true;
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

		await endHoldPlaceTransaction(firestore, transaction, {
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
		await endHoldPlaceTransaction(firestore, transaction, {
			holdPlaceId: input.holdPlaceId,
			requireOwner: false,
			expireAtRequired: input.now,
			now: input.now,
			allowMissing: true,
			allowAlreadyEnded: true,
		});
	});
}
