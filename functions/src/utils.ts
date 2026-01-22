export function eraseUndefined<T>(values: { [index: string]: any }) {
	Object.keys(values).forEach((key) => {
		if (values[key] === undefined) {
			delete values[key];
		}
	});
	return values as T;
}
