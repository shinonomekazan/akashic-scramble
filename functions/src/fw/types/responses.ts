export interface Meta {
	status: number;
	errorCode?: number;
	message?: string;
}

export interface ApiResponseWithoutData {
	meta: Meta;
	data?: any;
}

export interface ApiResponseWithData<D> {
	meta: Meta;
	data: D;
}

export type ApiResponse = ApiResponseWithoutData | ApiResponseWithData<any>;
