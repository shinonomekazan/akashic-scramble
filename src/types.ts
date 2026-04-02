import type { Timestamp } from "firebase/firestore";

export interface User {
	uid: string;
	name: string;
	photoURL?: string | null;
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}

export interface ManageUser {
	id: string;
	name: string;
	note?: string | null;
	role?: "administrator";
	createdAt?: Timestamp | null;
	updatedAt?: Timestamp | null;
}
