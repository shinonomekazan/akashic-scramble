import { doc, Firestore, getDoc } from "firebase/firestore";
import { ManageUser } from "../types";

export async function resolvers(firestore: Firestore, uid: string): Promise<ManageUser | null> {
	const manageUserDoc = await getDoc(doc(firestore, "manageUsers", uid));
	if (!manageUserDoc.exists()) {
		return null;
	}
	const data = manageUserDoc.data() as Omit<ManageUser, "id">;
	return {
		id: manageUserDoc.id,
		...data,
	};
}
