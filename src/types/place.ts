export type PlacePermission = "player" | "viewer";

export type PlaceBehaviour =
	| {
			type: "holdableTime";
			time: number;
	  }
	| {
			type: "connectionLimit";
			limit: number;
	  }
	| {
			type: "defaultPermission";
			permission: PlacePermission;
	  };

export interface Place {
	id: string;
	x: number;
	y: number;
	name: string;
	behaviours: PlaceBehaviour[];
	currentHoldPlaceId?: string;
}
