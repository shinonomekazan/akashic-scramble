import { User } from "../types";
import type { Client } from "./client";

export interface UpdateUserInput {
	name: string;
}

export async function createUser(client: Client, name: string) {
	return client.callWithAuthorization<{ user: User }>("POST", "/users", JSON.stringify({ name }));
}

export async function updateUser(client: Client, input: UpdateUserInput) {
	return client.callWithAuthorization<{ result: string }>("PUT", "/users/me", JSON.stringify(input));
}
