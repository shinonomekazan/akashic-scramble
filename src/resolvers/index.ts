import { doc, getDoc, type Firestore } from "firebase/firestore";
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
