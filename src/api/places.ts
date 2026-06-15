import type { Client } from "./client";

export async function holdPlace(client: Client, placeId: string) {
	return client.callWithAuthorization<{ holdPlaceId: string }>(
		"POST",
		`/places/${encodeURIComponent(placeId)}/hold`,
	);
}

export async function releasePlace(client: Client, placeId: string) {
	return client.callWithAuthorization<{ result: string }>("POST", `/places/${encodeURIComponent(placeId)}/release`);
}

export interface StartPlacePlayResult {
	holdPlaceId: string;
	placeId: string;
	playId: string;
	gameCode: string;
	gameTitle: string;
	gameDescription: string;
	contentUrl: string;
	inputAdapter: string;
	expireAt?: string;
	joinPath: string;
}

export interface LaunchHoldPlacePlayResult {
	holdPlaceId: string;
	placeId: string;
	playId: string;
	mode: "active" | "passive";
	userId: string;
	gameCode: string;
	gameTitle: string;
	gameDescription: string;
	contentUrl: string;
	inputAdapter: string;
	expireAt?: string;
	playToken: string;
	playlogServerUrl: string;
	gamePageUrl: string;
}

export async function startPlacePlay(client: Client, placeId: string) {
	return client.callWithAuthorization<StartPlacePlayResult>(
		"POST",
		`/places/${encodeURIComponent(placeId)}/play/start`,
	);
}

export async function launchHoldPlacePlay(client: Client, holdPlaceId: string) {
	return client.callWithAuthorization<LaunchHoldPlacePlayResult>(
		"POST",
		`/holdPlaces/${encodeURIComponent(holdPlaceId)}/play/launch`,
	);
}

export async function endHoldPlacePlay(client: Client, holdPlaceId: string) {
	return client.callWithAuthorization<{ result: string; holdPlaceId: string; placeId?: string; playId?: string }>(
		"POST",
		`/holdPlaces/${encodeURIComponent(holdPlaceId)}/play/end`,
	);
}
