export function qs<T extends Element>(selector: string, element: ParentNode = document): T | null {
	return element.querySelector<T>(selector);
}

export function qsStrict<T extends Element>(selector: string, element: ParentNode = document): T {
	const result = qs<T>(selector, element);
	if (result == null) throw new Error(`${selector} が見つかりません`);
	return result;
}

export function qsStrictAll<T extends Element>(parent: ParentNode, query: string) {
	const result = parent.querySelectorAll<T>(query);
	if (result.length === 0) throw new Error(`${query} が見つかりません`);
	return result;
}

export function isXXXMode(param: string) {
	const params = new URLSearchParams(location.search);
	return params.has(param);
}

export function isDebugMode() {
	return isXXXMode("debug");
}

export type Route =
	| { name: "login" }
	| { name: "my" }
	| { name: "my-edit" }
	| { name: "top" }
	| { name: "place"; placeId: string }
	| { name: "play"; holdPlaceId: string };

function decodeRouteComponent(value: string) {
	try {
		const decoded = decodeURIComponent(value);
		if (!decoded || decoded.includes("/")) return undefined;
		return decoded;
	} catch {
		return undefined;
	}
}

export function parseRoute(): Route {
	const path = window.location.pathname || "/";
	if (path.startsWith("/place/")) {
		const placeId = decodeRouteComponent(path.replace("/place/", ""));
		if (placeId) {
			return { name: "place", placeId };
		}
	}
	if (path.startsWith("/play/")) {
		const holdPlaceId = decodeRouteComponent(path.replace("/play/", ""));
		if (holdPlaceId) {
			return { name: "play", holdPlaceId };
		}
	}
	if (path.startsWith("/my/edit")) {
		return { name: "my-edit" };
	}
	if (path.startsWith("/my")) {
		return { name: "my" };
	}
	if (path.startsWith("/login")) {
		return { name: "login" };
	}
	return { name: "top" };
}

export function isStaticPath(pathname = window.location.pathname || "/") {
	return pathname.startsWith("/static/");
}

export function navigateTo(path: string) {
	const url = new URL(path, location.origin);
	if (isDebugMode()) {
		url.searchParams.set("debug", "true");
	}
	history.pushState({}, "", url.toString());
	window.dispatchEvent(new PopStateEvent("popstate"));
}

export function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
