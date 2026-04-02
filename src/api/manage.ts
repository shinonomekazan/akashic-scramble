import { Client } from "./client";

interface AuthenticateResult {
	role: string | null;
}

export function authenticate(client: Client, id: string = "me") {
	return client.callWithAuthorization<AuthenticateResult>("POST", `/manage/${id}/authenticate`);
}
