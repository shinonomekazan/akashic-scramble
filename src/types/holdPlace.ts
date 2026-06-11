import type { Timestamp } from "firebase/firestore";
import type { PlaceBehaviour } from "./place";

export interface HoldPlace {
	id: string;
	placeId: string;
	behaviours: PlaceBehaviour[];
	holdUserId?: string;
	currentPlayId?: string;
	currentPlayGameCode?: string;
	currentPlayTitle?: string;
	currentPlayDescription?: string;
	currentPlayContentUrl?: string;
	currentPlayInputAdapter?: string;
	activeUserId?: string;
	expireAt?: Timestamp;
	endedAt?: Timestamp;
}
