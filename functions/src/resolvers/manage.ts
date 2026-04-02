import { Firestore } from "firebase-admin/firestore";
import { ManageUser } from "../types";

export async function resolve(firestore: Firestore, id: string): Promise<ManageUser | null> {
	const userDoc = await firestore.collection("manageUsers").doc(id).get();
	if (userDoc.exists !== true) return null;
	return {
		...userDoc.data(),
		id: userDoc.id,
	} as ManageUser;
}
