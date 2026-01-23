export interface Meta {
	status: number;
	errorCode?: number;
	errorMessage?: string;
}

export interface BaseResponse<T> {
	meta: Meta;
	data: T;
}
