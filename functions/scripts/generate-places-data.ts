import { Timestamp } from "firebase-admin/firestore";
import { Place } from "../src/types/firestore";
import { places } from "./data/Place";
import { db, delay } from "./utils";
import { eraseUndefined } from "../src/utils";

(async () => {
	for (const place of places) {
		const timestamp = Timestamp.now();

		const dataPlace: Place = {
			x: place.x,
			y: place.y,
			name: place.name,
			behaviours: place.behaviours,
			currentHoldPlaceId: place.currentHoldPlaceId,
			createdAt: timestamp,
			updatedAt: timestamp,
		};

		await db
			.collection("places")
			.doc(place.id)
			.set(eraseUndefined({ ...dataPlace }));

		console.log(`Created spot: ${place.name}`);
		await delay(500);
	}

	console.log("Done.");
})();
