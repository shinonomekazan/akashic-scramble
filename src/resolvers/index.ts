import { collection, doc, getDoc, getDocs, type Firestore } from "firebase/firestore";
import type { Place, PlaceBehaviour } from "../types/place";
import type { User } from "../types";

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
		const data = docSnap.data() as Place;
		return {
			id: docSnap.id,
			x: typeof data.x === "number" ? data.x : 0,
			y: typeof data.y === "number" ? data.y : 0,
			name: data.name ?? docSnap.id,
			behaviours: data.behaviours ?? [],
			currentHoldPlaceId: data.currentHoldPlaceId,
		};
	});
}
