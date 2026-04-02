import { collection, doc, getDoc, getDocs, onSnapshot, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { HoldPlace } from "../types/holdPlace";
import type { Place, PlaceBehaviour } from "../types/place";
import type { User } from "../types";
import * as manage from "./manage";

export { manage };

function normalizePlace(id: string, data: Partial<Place> | undefined): Place {
	return {
		id,
		x: typeof data?.x === "number" ? data.x : 0,
		y: typeof data?.y === "number" ? data.y : 0,
		name: data?.name ?? id,
		behaviours: Array.isArray(data?.behaviours) ? (data.behaviours as PlaceBehaviour[]) : [],
		currentHoldPlaceId: typeof data?.currentHoldPlaceId === "string" ? data.currentHoldPlaceId : undefined,
	};
}

function normalizeHoldPlace(id: string, data: Partial<HoldPlace> | undefined): HoldPlace {
	return {
		id,
		placeId: data?.placeId ?? "",
		behaviours: Array.isArray(data?.behaviours) ? (data.behaviours as PlaceBehaviour[]) : [],
		holdUserId: typeof data?.holdUserId === "string" ? data.holdUserId : undefined,
		currentPlayId: typeof data?.currentPlayId === "string" ? data.currentPlayId : undefined,
		expireAt: data?.expireAt,
		endedAt: data?.endedAt,
	};
}

export async function getUser(firestore: Firestore, uid: string): Promise<User | null> {
	const snapshot = await getDoc(doc(firestore, "users", uid));
	if (!snapshot.exists()) {
		return null;
	}
	const data = snapshot.data() as Partial<User>;
	return {
		uid,
		name: data.name ?? "未設定",
		photoURL: data.photoURL ?? null,
		createdAt: data.createdAt ?? null,
		updatedAt: data.updatedAt ?? null,
	};
}

export async function getPlaces(firestore: Firestore): Promise<Place[]> {
	const snapshot = await getDocs(collection(firestore, "places"));
	return snapshot.docs.map((docSnap) => {
		const data = docSnap.data() as Partial<Place>;
		return normalizePlace(docSnap.id, data);
	});
}

export function watchPlace(
	firestore: Firestore,
	placeId: string,
	onChange: (place: Place | null) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	const placeRef = doc(firestore, "places", placeId);
	return onSnapshot(
		placeRef,
		(snapshot) => {
			if (!snapshot.exists()) {
				onChange(null);
				return;
			}
			const data = snapshot.data() as Partial<Place>;
			onChange(normalizePlace(snapshot.id, data));
		},
		(error) => {
			if (onError) {
				onError(error);
			} else {
				console.error(error);
			}
		},
	);
}

export function watchHoldPlace(
	firestore: Firestore,
	holdPlaceId: string,
	onChange: (holdPlace: HoldPlace | null) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	const holdPlaceRef = doc(firestore, "holdPlaces", holdPlaceId);
	return onSnapshot(
		holdPlaceRef,
		(snapshot) => {
			if (!snapshot.exists()) {
				onChange(null);
				return;
			}
			const data = snapshot.data() as Partial<HoldPlace>;
			onChange(normalizeHoldPlace(snapshot.id, data));
		},
		(error) => {
			if (onError) {
				onError(error);
			} else {
				console.error(error);
			}
		},
	);
}
