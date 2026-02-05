import { UserProfile } from "../types";
import { Firestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { eraseUndefined } from "../utils";
import * as fw from "../fw";
import { HoldPlace, Place } from "../types/firestore";

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
		transaction.update(
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

		const holdPlaceRef = firestore.collection("holdPlaces").doc(currentHoldPlaceId);
		const holdPlaceSnap = await transaction.get(holdPlaceRef);
		if (!holdPlaceSnap.exists) {
			throw new fw.types.NotFound(`HoldPlace with id ${currentHoldPlaceId} not found`);
		}

		const holdPlaceData = holdPlaceSnap.data() as Partial<HoldPlace>;
		if (holdPlaceData.endedAt) {
			throw new fw.types.Duplicate("HoldPlace is already ended");
		}

		if (holdPlaceData.holdUserId && holdPlaceData.holdUserId !== input.holdUserId) {
			throw new fw.types.Forbidden("HoldPlace is owned by another user");
		}

		const now = Timestamp.now();
		await transaction.update(
			holdPlaceRef,
			eraseUndefined({
				endedAt: now,
				updatedAt: now,
			}),
		);
		await transaction.update(placeRef, {
			currentHoldPlaceId: FieldValue.delete(),
			updatedAt: now,
		});
	});
}
