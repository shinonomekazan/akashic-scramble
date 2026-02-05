import type { Client } from "./client";

export async function holdPlace(client: Client, placeId: string) {
	return client.callWithAuthorization<{ holdPlaceId: string }>("POST", `/places/${placeId}/hold`);
}

export async function releasePlace(client: Client, placeId: string) {
	return client.callWithAuthorization<{ result: string }>("POST", `/places/${placeId}/release`);
}
