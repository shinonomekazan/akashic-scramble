import { Firestore } from "firebase-admin/firestore";
import { UserProfile } from "../types";

export async function resolve(firestore: Firestore, id: string): Promise<UserProfile | null> {
	const userDoc = await firestore.collection("users").doc(id).get();
	if (userDoc.exists !== true) return null;
	return {
		...userDoc.data(),
		uid: userDoc.id,
	} as UserProfile;
}
