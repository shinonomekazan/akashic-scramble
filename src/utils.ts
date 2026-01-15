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

export type Route = { name: "login" } | { name: "my" } | { name: "top" };

export function parseRoute(): Route {
	const path = window.location.pathname || "/";
	if (path.startsWith("/my")) {
		return { name: "my" };
	}
	if (path.startsWith("/login")) {
		return { name: "login" };
	}
	return { name: "top" };
}

export function navigateTo(path: string) {
	const url = new URL(location.href);
	url.hash = "";
	url.pathname = path;
	if (isDebugMode()) {
		url.searchParams.set("debug", "true");
	}
	history.pushState({}, "", url.toString());
	window.dispatchEvent(new PopStateEvent("popstate"));
}
