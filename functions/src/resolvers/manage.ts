import { Firestore } from "firebase-admin/firestore";
import { ManageUser } from "../types";

export async function resolve(firestore: Firestore, id: string) {
	const userDoc = await firestore.collection("manageUsers").doc(id).get();
	if (userDoc.exists !== true) return undefined;
	return {
		...userDoc.data(),
		id: userDoc.id,
	} as ManageUser;
}
