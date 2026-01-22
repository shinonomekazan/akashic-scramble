export type FirebaseConfig = {
	apiKey: string;
	authDomain: string;
	projectId: string;
	storageBucket: string;
	messagingSenderId: string;
	appId: string;
	measurementId?: string;
};

export type AppConfig = {
	firebaseConfig: FirebaseConfig;
	apiConfig: ApiConfig;
};

export interface ApiConfig {
	baseUrl: string;
	emulatorBaseUrl?: string;
	apiKey?: string;
}
