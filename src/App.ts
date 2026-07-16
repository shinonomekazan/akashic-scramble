import { connectAuthEmulator, type User as FirebaseUser } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { Client as ApiClient } from "./api/client";
import {
	endHoldPlacePlay,
	holdPlace,
	launchHoldPlacePlay,
	type LaunchHoldPlacePlayResult,
	releasePlace,
	startPlacePlay,
} from "./api/places";
import { createUser, updateUser } from "./api/users";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { getPlaces, getUser, watchHoldPlace, watchPlace } from "./resolvers";
import type { HoldPlace } from "./types/holdPlace";
import type { Place } from "./types/place";
import type { User as FirestoreUser } from "./types";
import * as utils from "./utils";
import "./css/bootstrap.min.css";

type AuthState = {
	user: FirebaseUser | null;
	loading: boolean;
	profile: FirestoreUser | null;
	profileLoaded: boolean;
	profileLoading: boolean;
	needsProfile: boolean;
};

type PlaceStatus = "playing" | "idle";

const fixedGameTitle = "Rocket Game";
const fixedGameDescription = "";

type TopState = {
	places: Place[];
	loading: boolean;
	loaded: boolean;
	error: string | null;
	cameraX: number | null;
	cameraY: number | null;
};

type TopPointerState = {
	pointerId: number | null;
	startClientX: number;
	startClientY: number;
	startCameraX: number;
	startCameraY: number;
	moved: boolean;
};

type PlaceState = {
	placeId: string | null;
	selectedPlace: Place | null;
	selectedPlaceLoading: boolean;
	selectedPlaceError: string | null;
	selectedHoldPlace: HoldPlace | null;
	selectedHoldPlaceLoading: boolean;
	selectedHoldPlaceError: string | null;
	ignoreHoldPlaceId: string | null;
	holdSubmitting: boolean;
	holdSubmittingPlaceId: string | null;
	releaseSubmitting: boolean;
	releaseSubmittingPlaceId: string | null;
	playStarting: boolean;
	playStartingHoldPlaceId: string | null;
	playEnding: boolean;
	playEndingHoldPlaceId: string | null;
};

type PlayLaunchState = {
	holdPlaceId: string | null;
	loading: boolean;
	loaded: boolean;
	error: string | null;
	launch: LaunchHoldPlacePlayResult | null;
	ending: boolean;
};

export class App {
	firebase: FirebaseInstance;
	client: ApiClient;
	config: AppConfig;
	rootEl: HTMLElement;
	toastEl: HTMLElement;
	state: AuthState;
	topState: TopState;
	placeState: PlaceState;
	playLaunchState: PlayLaunchState;
	placeWatchUnsub: (() => void) | null;
	placeWatchId: string | null;
	holdPlaceWatchUnsub: (() => void) | null;
	holdPlaceWatchId: string | null;
	topPointerState: TopPointerState;

	constructor(config: AppConfig = appConfig as AppConfig) {
		this.config = config;
		this.rootEl = this.getRoot();
		this.toastEl = utils.qsStrict<HTMLElement>("#toast");
		this.firebase = initializeFirebase(this.config.firebaseConfig);
		this.client = new ApiClient({
			apiConfig: this.config.apiConfig,
			useEmulator: utils.isDebugMode(),
		});
		this.client.idTokenFunction = async () => {
			const currentUser = this.firebase.auth.currentUser;
			if (!currentUser) {
				throw new Error("Authorization not found");
			}
			return currentUser.getIdToken();
		};
		this.connectEmulatorIfDebug();
		this.state = {
			user: null,
			loading: true,
			profile: null,
			profileLoaded: false,
			profileLoading: false,
			needsProfile: false,
		};
		const searchParams = new URLSearchParams(location.search);
		const cameraX = Number.parseFloat(searchParams.get("x") ?? "");
		const cameraY = Number.parseFloat(searchParams.get("y") ?? "");

		this.topState = {
			places: [],
			loading: false,
			loaded: false,
			error: null,
			cameraX: Number.isFinite(cameraX) ? cameraX : null,
			cameraY: Number.isFinite(cameraY) ? cameraY : null,
		};

		this.placeState = {
			placeId: null,
			selectedPlace: null,
			selectedPlaceLoading: false,
			selectedPlaceError: null,
			selectedHoldPlace: null,
			selectedHoldPlaceLoading: false,
			selectedHoldPlaceError: null,
			ignoreHoldPlaceId: null,
			holdSubmitting: false,
			holdSubmittingPlaceId: null,
			releaseSubmitting: false,
			releaseSubmittingPlaceId: null,
			playStarting: false,
			playStartingHoldPlaceId: null,
			playEnding: false,
			playEndingHoldPlaceId: null,
		};

		this.playLaunchState = {
			holdPlaceId: null,
			loading: false,
			loaded: false,
			error: null,
			launch: null,
			ending: false,
		};

		this.placeWatchUnsub = null;
		this.placeWatchId = null;
		this.holdPlaceWatchUnsub = null;
		this.holdPlaceWatchId = null;
		this.topPointerState = {
			pointerId: null,
			startClientX: 0,
			startClientY: 0,
			startCameraX: 0,
			startCameraY: 0,
			moved: false,
		};
	}

	main() {
		if (utils.isStaticPath()) return;
		this.renderLoading();
		watchAuthChanges(this.firebase, (user) => {
			this.state = {
				user,
				loading: false,
				profile: null,
				profileLoaded: false,
				profileLoading: false,
				needsProfile: false,
			};
			this.render();
		});
		window.addEventListener("popstate", () => {
			this.render();
		});
		window.addEventListener("resize", () => {
			if (utils.parseRoute().name !== "top") return;
			const gridMetrics = this.getGridMetrics(this.topState.places);
			this.applyTopGridLayout(gridMetrics);
		});
		window.addEventListener("message", (event) => {
			if (event.data?.type !== "akashic-system-launch-ready") return;
			const launch = this.playLaunchState.launch;
			if (!launch) return;
			const frame = this.rootEl.querySelector<HTMLIFrameElement>("#play-frame");
			if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
			const expectedOrigin = new URL(launch.gamePageUrl).origin;
			if (event.origin !== expectedOrigin) return;
			this.postPlayLaunchConfig(expectedOrigin);
		});
	}

	connectEmulatorIfDebug() {
		if (!utils.isDebugMode()) return;
		connectAuthEmulator(this.firebase.auth, "http://localhost:9099", { disableWarnings: true });
		connectFirestoreEmulator(this.firebase.firestore, "localhost", 8080);
	}

	getRoot(): HTMLElement {
		return utils.qsStrict<HTMLElement>("#app-root");
	}

	renderLoading() {
		this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
	}

	render() {
		if (this.state.loading) {
			this.renderLoading();
			return;
		}

		const route = utils.parseRoute();
		if (route.name !== "place") {
			this.stopSelectedPlaceWatch();
			this.stopSelectedHoldPlaceWatch();
			if (this.placeState.placeId && this.topState.loaded) {
				this.topState = {
					...this.topState,
					loaded: false,
				};
			}
			if (
				this.placeState.placeId ||
				this.placeState.selectedPlace ||
				this.placeState.selectedPlaceLoading ||
				this.placeState.selectedPlaceError ||
				this.placeState.selectedHoldPlace ||
				this.placeState.selectedHoldPlaceLoading ||
				this.placeState.selectedHoldPlaceError ||
				this.placeState.ignoreHoldPlaceId ||
				this.placeState.holdSubmitting ||
				this.placeState.holdSubmittingPlaceId ||
				this.placeState.releaseSubmitting ||
				this.placeState.releaseSubmittingPlaceId ||
				this.placeState.playStarting ||
				this.placeState.playStartingHoldPlaceId ||
				this.placeState.playEnding ||
				this.placeState.playEndingHoldPlaceId
			) {
				this.placeState = {
					...this.placeState,
					placeId: null,
					selectedPlace: null,
					selectedPlaceLoading: false,
					selectedPlaceError: null,
					selectedHoldPlace: null,
					selectedHoldPlaceLoading: false,
					selectedHoldPlaceError: null,
					ignoreHoldPlaceId: null,
					holdSubmitting: false,
					holdSubmittingPlaceId: null,
					releaseSubmitting: false,
					releaseSubmittingPlaceId: null,
					playStarting: false,
					playStartingHoldPlaceId: null,
					playEnding: false,
					playEndingHoldPlaceId: null,
				};
			}
		}
		if (route.name !== "play" && this.playLaunchState.holdPlaceId) {
			this.playLaunchState = {
				holdPlaceId: null,
				loading: false,
				loaded: false,
				error: null,
				launch: null,
				ending: false,
			};
		}
		switch (route.name) {
			case "login":
				this.renderLogin();
				break;
			case "my":
				this.renderMy();
				break;
			case "my-edit":
				this.renderMyEdit();
				break;
			case "top":
				this.renderTop();
				break;
			case "place":
				this.renderPlace(route.placeId);
				break;
			case "play":
				this.renderPlay(route.holdPlaceId);
				break;
			default:
				this.renderTop();
				break;
		}
	}

	renderLogin() {
		if (this.state.user) {
			utils.navigateTo("/");
			return;
		}

		const menuMarkup = this.renderMenuMarkup(null, null);
		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5">
				<div class="text-center">
					<h1 class="h5 mb-4">アカシック・スクランブル</h1>
					<div class="d-grid gap-3">
						<button id="login-niconico" class="btn btn-outline-primary">ニコニコでログイン</button>
						<button id="login-google" class="btn btn-outline-primary">Googleでログイン</button>
					</div>
				</div>
			</div>
			${menuMarkup}
		`;

		this.bindLoginEvents();
		this.bindMenuEvents(null);
	}

	renderTop() {
		const user = this.state.user;
		if (user && this.state.profileLoaded && this.state.needsProfile) {
			utils.navigateTo("/my");
			return;
		}
		this.syncTopCameraFromUrl();
		if (user && !this.state.profileLoaded && !this.state.profileLoading) {
			void this.loadUserProfile();
		}

		if (!this.topState.loaded && !this.topState.loading) {
			void this.loadPlaces();
		}

		const { places, loading, error } = this.topState;
		const gridMetrics = this.getGridMetrics(places);
		const nextCamera = this.resolveTopCamera(gridMetrics);
		if (this.topState.cameraX !== nextCamera.cameraX || this.topState.cameraY !== nextCamera.cameraY) {
			this.topState = {
				...this.topState,
				cameraX: nextCamera.cameraX,
				cameraY: nextCamera.cameraY,
			};
		}

		const placeCardsMarkup = places
			.map((place) => this.renderTopPlaceCard(place, gridMetrics.minX, gridMetrics.minY))
			.join("");

		let gridOverlay = "";
		if (loading) {
			gridOverlay = '<div class="top-grid-overlay">読み込み中...</div>';
		} else if (error) {
			gridOverlay = `<div class="top-grid-overlay is-error">${utils.escapeHtml(error)}</div>`;
		} else if (places.length === 0) {
			gridOverlay = '<div class="top-grid-overlay">Placeがまだありません。</div>';
		}

		const menuMarkup = this.renderMenuMarkup(user, this.state.profile);
		this.rootEl.innerHTML = `
				<div class="top-page container py-5">
					<div class="d-flex align-items-end justify-content-between flex-wrap gap-3 mb-3">
						<h1 class="h4 m-0">プレイス一覧</h1>
					</div>
					<div id="top-grid-stage" class="top-grid-stage border rounded-3 p-3 bg-white position-relative">
						<div id="top-grid-viewport" class="top-grid-viewport">
							<div
								id="top-grid"
								class="top-grid"
								data-min-x="${gridMetrics.minX}"
								data-min-y="${gridMetrics.minY}"
								style="--cols:${gridMetrics.cols}; --rows:${gridMetrics.rows};"
							>
								${placeCardsMarkup}
							</div>
						</div>
						${gridOverlay}
					</div>
				</div>
			${menuMarkup}
		`;

		this.bindMenuEvents(user);
		this.bindTopEvents();
	}

	renderPlace(placeId: string) {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}
		if (user && !this.state.profileLoaded && !this.state.profileLoading) {
			void this.loadUserProfile();
		}

		this.syncSelectedPlaceWatch(placeId);
		const menuMarkup = this.renderMenuMarkup(user, this.state.profile);
		const selectedPlaceMarkup = this.renderSelectedPlacePanel();
		const placeName = this.placeState.selectedPlace?.name ?? "Place";
		const placeIdLabel = this.placeState.selectedPlace?.id ?? placeId;

		this.rootEl.innerHTML = `
			<div class="place-page container py-5">
				<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
					<button id="place-back" class="btn btn-outline-secondary btn-sm" type="button">一覧に戻る</button>
					<div class="text-end">
						<div class="small text-muted">Place</div>
						<div class="h5 m-0">${utils.escapeHtml(placeName)}</div>
						<div class="small text-muted">ID: ${utils.escapeHtml(placeIdLabel)}</div>
					</div>
				</div>
				${selectedPlaceMarkup}
			</div>
			${menuMarkup}
		`;

		this.bindMenuEvents(user);
		this.bindPlaceEvents();
	}

	renderPlay(holdPlaceId: string) {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}
		if (user && !this.state.profileLoaded && !this.state.profileLoading) {
			void this.loadUserProfile();
		}
		if (!this.state.profileLoaded || this.state.profileLoading) {
			this.rootEl.innerHTML = '<div class="loading">Loading profile...</div>';
			return;
		}

		if (this.playLaunchState.holdPlaceId !== holdPlaceId) {
			this.playLaunchState = {
				holdPlaceId,
				loading: false,
				loaded: false,
				error: null,
				launch: null,
				ending: false,
			};
		}
		if (!this.playLaunchState.loaded && !this.playLaunchState.loading) {
			void this.loadPlayLaunch(holdPlaceId);
		}

		const menuMarkup = this.renderMenuMarkup(user, this.state.profile);
		const { loading, error, launch, ending } = this.playLaunchState;
		let bodyMarkup = "";
		if (loading) {
			bodyMarkup = '<div class="text-muted">ゲーム起動情報を取得中...</div>';
		} else if (error) {
			bodyMarkup = `<div class="text-danger small">${utils.escapeHtml(error)}</div>`;
		} else if (!launch) {
			bodyMarkup = '<div class="text-muted">起動できるPlayがありません。</div>';
		} else {
			const frameUrl = this.buildAkashicFrameUrl(launch);
			const shareUrl = new URL(`/play/${encodeURIComponent(holdPlaceId)}`, location.origin).toString();
			const expireText = this.formatDateTime(launch.expireAt);
			const modeLabel = launch.mode === "active" ? "操作担当" : "参加中";
			bodyMarkup = `
				<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
					<div>
						<div class="small text-muted">${utils.escapeHtml(modeLabel)}</div>
						<div class="fw-semibold">${utils.escapeHtml(launch.gameTitle || "Akashic Game")}</div>
						<div class="small text-muted">Play ID: ${utils.escapeHtml(launch.playId)}</div>
					</div>
					${
						launch.mode === "active"
							? `<button id="play-end-button" class="btn btn-outline-secondary btn-sm" data-hold-place-id="${utils.escapeHtml(
									holdPlaceId,
								)}" ${ending ? "disabled" : ""} type="button">${ending ? "終了中..." : "Play終了"}</button>`
							: ""
					}
				</div>
				<div class="row g-3 align-items-start">
					<div class="col-12 col-lg-8">
						<div class="ratio ratio-1x1 border rounded-3 overflow-hidden bg-dark">
							<iframe
								id="play-frame"
								title="Akashic Game"
								src="${utils.escapeHtml(frameUrl)}"
								allow="fullscreen"
								style="border:0;"
							></iframe>
						</div>
					</div>
					<div class="col-12 col-lg-4">
						<div class="mb-3">
							<div class="small text-muted mb-1">参加URL</div>
							<div class="small text-break border rounded p-2 bg-light mb-2">${utils.escapeHtml(shareUrl)}</div>
							<button id="play-copy-url-button" class="btn btn-outline-secondary btn-sm" data-url="${utils.escapeHtml(
								shareUrl,
							)}" type="button">URLをコピー</button>
						</div>
						<div class="mb-3">
							<div class="small text-muted mb-1">コンテンツ</div>
							<div class="fw-semibold">${utils.escapeHtml(launch.gameTitle || "Akashic Game")}</div>
							<div class="small text-secondary">${utils.escapeHtml(launch.gameDescription || "")}</div>
						</div>
						${expireText ? `<div class="small text-muted">このPlayは ${utils.escapeHtml(expireText)} まで遊べます。</div>` : ""}
					</div>
				</div>
			`;
		}

		this.rootEl.innerHTML = `
			<div class="play-page container py-5">
				<div class="mb-3">
					<button id="play-back" class="btn btn-outline-secondary btn-sm" ${
						launch?.placeId ? `data-place-id="${utils.escapeHtml(launch.placeId)}"` : ""
					} type="button">戻る</button>
				</div>
				<div class="card">
					<div class="card-body">
						${bodyMarkup}
					</div>
				</div>
			</div>
			${menuMarkup}
		`;

		this.bindMenuEvents(user);
		this.bindPlayEvents();
	}

	buildAkashicFrameUrl(launch: LaunchHoldPlacePlayResult) {
		const url = new URL(launch.gamePageUrl);
		url.searchParams.set("config_source", "post_message");
		url.searchParams.set("parent_origin", location.origin);
		return url.toString();
	}

	formatDateTime(value: unknown) {
		if (!value) return null;
		let date: Date | null = null;
		if (typeof value === "string") {
			date = new Date(value);
		} else if (value instanceof Date) {
			date = value;
		} else if (typeof (value as { toDate?: unknown }).toDate === "function") {
			date = (value as { toDate: () => Date }).toDate();
		}
		if (!date || Number.isNaN(date.getTime())) return null;
		return new Intl.DateTimeFormat("ja-JP", {
			month: "numeric",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	}

	async loadPlayLaunch(holdPlaceId: string) {
		this.playLaunchState = {
			holdPlaceId,
			loading: true,
			loaded: false,
			error: null,
			launch: null,
			ending: false,
		};
		this.render();
		try {
			const response = await launchHoldPlacePlay(this.client, holdPlaceId);
			if (this.playLaunchState.holdPlaceId !== holdPlaceId) return;
			this.playLaunchState = {
				holdPlaceId,
				loading: false,
				loaded: true,
				error: null,
				launch: response.data,
				ending: false,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "ゲーム起動情報の取得に失敗しました。";
			if (this.playLaunchState.holdPlaceId !== holdPlaceId) return;
			this.playLaunchState = {
				holdPlaceId,
				loading: false,
				loaded: true,
				error: message,
				launch: null,
				ending: false,
			};
		}
		this.render();
	}

	postPlayLaunchConfig(targetOrigin?: string) {
		const launch = this.playLaunchState.launch;
		if (!launch) return;
		const frame = this.rootEl.querySelector<HTMLIFrameElement>("#play-frame");
		if (!frame?.contentWindow) return;
		const origin = targetOrigin ?? new URL(launch.gamePageUrl).origin;
		frame.contentWindow.postMessage(
			{
				type: "akashic-system-launch-config",
				payload: {
					mode: launch.mode,
					playId: launch.playId,
					userId: launch.userId,
					contentUrl: launch.contentUrl,
					playToken: launch.playToken,
					playlogServerUrl: launch.playlogServerUrl,
				},
			},
			origin,
		);
	}

	getGridMetrics(places: Place[]) {
		if (places.length === 0) {
			return { minX: 0, maxX: 0, minY: 0, maxY: 0, cols: 1, rows: 1 };
		}
		const xs = places.map((place) => place.x);
		const ys = places.map((place) => place.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		return {
			minX,
			maxX,
			minY,
			maxY,
			cols: maxX - minX + 1,
			rows: maxY - minY + 1,
		};
	}

	clampTopCamera(cameraX: number, cameraY: number, gridMetrics: ReturnType<App["getGridMetrics"]>) {
		return {
			cameraX: Math.min(gridMetrics.maxX, Math.max(gridMetrics.minX, cameraX)),
			cameraY: Math.min(gridMetrics.maxY, Math.max(gridMetrics.minY, cameraY)),
		};
	}

	getDefaultTopCamera(gridMetrics: ReturnType<App["getGridMetrics"]>) {
		let defaultCameraX = (gridMetrics.minX + gridMetrics.maxX) / 2;
		let defaultCameraY = (gridMetrics.minY + gridMetrics.maxY) / 2;
		const places = this.topState.places;
		if (places.length > 0) {
			const avgX = places.reduce((sum, place) => sum + place.x, 0) / places.length;
			const avgY = places.reduce((sum, place) => sum + place.y, 0) / places.length;
			let anchor = places[0];
			let minDistance = Number.POSITIVE_INFINITY;
			for (const place of places) {
				const distance = Math.hypot(place.x - avgX, place.y - avgY);
				if (distance < minDistance) {
					minDistance = distance;
					anchor = place;
				}
			}
			defaultCameraX = anchor.x;
			defaultCameraY = anchor.y;
		}
		return this.clampTopCamera(defaultCameraX, defaultCameraY, gridMetrics);
	}

	resolveTopCamera(gridMetrics: ReturnType<App["getGridMetrics"]>) {
		const defaultCamera = this.getDefaultTopCamera(gridMetrics);
		const hasCustomCamera = Number.isFinite(this.topState.cameraX) && Number.isFinite(this.topState.cameraY);
		const cameraX = hasCustomCamera ? (this.topState.cameraX as number) : defaultCamera.cameraX;
		const cameraY = hasCustomCamera ? (this.topState.cameraY as number) : defaultCamera.cameraY;
		return this.clampTopCamera(cameraX, cameraY, gridMetrics);
	}

	isAnyTopPlaceCardVisible() {
		const viewportEl = this.rootEl.querySelector<HTMLElement>("#top-grid-viewport");
		if (!viewportEl) return false;
		const viewportRect = viewportEl.getBoundingClientRect();
		const cards = Array.from(this.rootEl.querySelectorAll<HTMLElement>(".top-place-card"));
		return cards.some((card) => {
			const rect = card.getBoundingClientRect();
			return (
				rect.right > viewportRect.left &&
				rect.left < viewportRect.right &&
				rect.bottom > viewportRect.top &&
				rect.top < viewportRect.bottom
			);
		});
	}

	ensureTopGridCameraVisible() {
		if (!window.matchMedia("(max-width: 768px)").matches) return;
		if (this.topState.places.length === 0) return;
		if (this.isAnyTopPlaceCardVisible()) return;
		const fallbackCamera = this.getDefaultTopCamera(this.getGridMetrics(this.topState.places));
		if (this.topState.cameraX === fallbackCamera.cameraX && this.topState.cameraY === fallbackCamera.cameraY)
			return;
		this.topState = {
			...this.topState,
			cameraX: fallbackCamera.cameraX,
			cameraY: fallbackCamera.cameraY,
		};
		this.applyTopGridCamera();
	}

	applyTopGridLayout(gridMetrics: ReturnType<App["getGridMetrics"]>) {
		this.updateTopGridTileSize(gridMetrics);
		this.applyTopGridCamera();
		this.ensureTopGridCameraVisible();
	}

	scheduleTopGridLayout(gridMetrics: ReturnType<App["getGridMetrics"]>) {
		this.applyTopGridLayout(gridMetrics);
		window.requestAnimationFrame(() => {
			if (utils.parseRoute().name !== "top") return;
			this.applyTopGridLayout(gridMetrics);
		});
	}

	readTopLayoutMetrics(stageEl: HTMLElement) {
		const style = getComputedStyle(stageEl);
		const tileWidth = Number.parseFloat(style.getPropertyValue("--top-tile-width")) || 160;
		const tileHeight = Number.parseFloat(style.getPropertyValue("--top-tile-height")) || 140;
		const tileGap = Number.parseFloat(style.getPropertyValue("--top-tile-gap")) || 12;
		return {
			tileWidth,
			tileHeight,
			tileGap,
			tileStrideX: tileWidth + tileGap,
			tileStrideY: tileHeight + tileGap,
		};
	}

	updateTopGridTileSize(gridMetrics: ReturnType<App["getGridMetrics"]>) {
		const stageEl = this.rootEl.querySelector<HTMLElement>("#top-grid-stage");
		const viewportEl = this.rootEl.querySelector<HTMLElement>("#top-grid-viewport");
		if (!stageEl || !viewportEl) return;
		if (viewportEl.clientWidth <= 0 || viewportEl.clientHeight <= 0) return;
		const style = getComputedStyle(stageEl);
		const gap = Number.parseFloat(style.getPropertyValue("--top-tile-gap")) || 12;
		const minTileWidth = Number.parseFloat(style.getPropertyValue("--top-tile-width-min")) || 160;
		const minTileHeight = Number.parseFloat(style.getPropertyValue("--top-tile-height-min")) || 140;
		const cols = Math.max(1, gridMetrics.cols);
		const rows = Math.max(1, gridMetrics.rows);
		const availableWidth = Math.max(0, viewportEl.clientWidth - gap * (cols - 1));
		const availableHeight = Math.max(0, viewportEl.clientHeight - gap * (rows - 1));
		const fitTileWidth = availableWidth / cols;
		const fitTileHeight = availableHeight / rows;
		const tileWidth = Math.max(minTileWidth, fitTileWidth);
		const tileHeight = Math.max(minTileHeight, fitTileHeight);
		stageEl.style.setProperty("--top-tile-width", String(tileWidth));
		stageEl.style.setProperty("--top-tile-height", String(tileHeight));
	}

	applyTopGridCamera() {
		const stageEl = this.rootEl.querySelector<HTMLElement>("#top-grid-stage");
		const viewportEl = this.rootEl.querySelector<HTMLElement>("#top-grid-viewport");
		const gridEl = this.rootEl.querySelector<HTMLElement>("#top-grid");
		if (!stageEl || !viewportEl || !gridEl) return;
		if (viewportEl.clientWidth <= 0 || viewportEl.clientHeight <= 0) return;

		const minX = Number.parseFloat(gridEl.dataset.minX ?? "");
		const minY = Number.parseFloat(gridEl.dataset.minY ?? "");
		if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

		const cameraX = this.topState.cameraX;
		const cameraY = this.topState.cameraY;
		if (cameraX == null || cameraY == null) return;

		const metrics = this.readTopLayoutMetrics(stageEl);
		const centerX = (cameraX - minX) * metrics.tileStrideX + metrics.tileWidth / 2;
		const centerY = (cameraY - minY) * metrics.tileStrideY + metrics.tileHeight / 2;
		const translateX = viewportEl.clientWidth / 2 - centerX;
		const translateY = viewportEl.clientHeight / 2 - centerY;
		gridEl.style.transform = `translate(${translateX}px, ${translateY}px)`;
	}

	updateTopCameraUrl(cameraX: number, cameraY: number) {
		const url = new URL(location.href);
		url.searchParams.set("x", cameraX.toFixed(3));
		url.searchParams.set("y", cameraY.toFixed(3));
		history.replaceState({}, "", url.toString());
	}

	syncTopCameraFromUrl() {
		const params = new URLSearchParams(location.search);
		const rawX = params.get("x");
		const rawY = params.get("y");
		if (rawX == null && rawY == null) {
			if (this.topState.cameraX == null && this.topState.cameraY == null) return;
			this.topState = {
				...this.topState,
				cameraX: null,
				cameraY: null,
			};
			return;
		}

		// Accept decimal values with "." (and tolerate "," by normalizing).
		const parsedX = Number.parseFloat((rawX ?? "").replace(",", "."));
		const parsedY = Number.parseFloat((rawY ?? "").replace(",", "."));
		if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) {
			// Ignore malformed partial params instead of forcing center fallback.
			return;
		}

		const nextCameraX = parsedX;
		const nextCameraY = parsedY;
		if (this.topState.cameraX === nextCameraX && this.topState.cameraY === nextCameraY) {
			return;
		}
		this.topState = {
			...this.topState,
			cameraX: nextCameraX,
			cameraY: nextCameraY,
		};
	}

	getPlaceStatus(place: Place): PlaceStatus {
		return place.currentHoldPlaceId ? "playing" : "idle";
	}

	getHoldableMinutes(place: Place): number | null {
		const behaviour = place.behaviours.find((item) => item.type === "holdableTime") as
			| { type: "holdableTime"; time: number }
			| undefined;
		if (!behaviour || typeof behaviour.time !== "number") return null;
		return Math.max(1, Math.round(behaviour.time / 60000));
	}

	renderTopPlaceCard(place: Place, minX: number, minY: number) {
		const col = place.x - minX + 1;
		const row = place.y - minY + 1;
		const status = this.getPlaceStatus(place);
		const statusLabel = status === "playing" ? "確保済" : "空き地";
		const statusText = status === "playing" ? "現在確保済み" : "現在空き地";
		const holdMinutes = this.getHoldableMinutes(place);
		const holdText = holdMinutes ? `保持 最大 ~${holdMinutes}分` : "保持 最大: 未設定";
		const statusBadgeClass = status === "playing" ? "bg-warning text-dark" : "bg-success";
		const selectedClass = "border";
		return `
			<div class="top-place-card card h-100 ${selectedClass} is-${status}" data-place-id="${utils.escapeHtml(
				place.id,
			)}" style="grid-column:${col}; grid-row:${row};">
				<div class="card-body top-place-card-body">
					<div class="top-place-card-badge-row">
						<span class="badge ${statusBadgeClass}">${statusLabel}</span>
					</div>
					<div class="top-place-card-name">${utils.escapeHtml(place.name)}</div>
					<div class="top-place-card-status">${statusText}</div>
					<div class="top-place-card-hold">${holdText}</div>
				</div>
			</div>
		`;
	}

	renderSelectedPlacePanel() {
		const { selectedPlace, selectedPlaceLoading, selectedPlaceError } = this.placeState;
		let bodyMarkup = "";

		if (selectedPlaceLoading) {
			bodyMarkup = '<div class="text-muted">読み込み中...</div>';
		} else if (selectedPlaceError) {
			bodyMarkup = `<div class="text-danger small">${utils.escapeHtml(selectedPlaceError)}</div>`;
		} else if (!selectedPlace) {
			bodyMarkup = '<div class="text-muted">選択したPlaceが見つかりません。</div>';
		} else {
			const status = this.getPlaceStatus(selectedPlace);
			const statusLabel = status === "playing" ? "確保済" : "空き地";
			const statusText = status === "playing" ? "現在確保済み" : "現在空き地";
			const statusBadgeClass = status === "playing" ? "bg-warning text-dark" : "bg-success";
			const holdMinutes = this.getHoldableMinutes(selectedPlace);
			const holdText = holdMinutes ? `保持 最大 ~${holdMinutes}分` : "保持 最大: 未設定";
			const holdPlace = this.placeState.selectedHoldPlace;
			const holdPlaceLoading = this.placeState.selectedHoldPlaceLoading;
			const holdPlaceError = this.placeState.selectedHoldPlaceError;
			const currentUserId = this.state.user?.uid ?? null;
			const holdOwnerId = holdPlace?.holdUserId;
			const isSelfHolding = status === "playing" && !!currentUserId && holdOwnerId === currentUserId;
			const isHoldable = status === "idle";
			const isReleasable = status === "playing" && isSelfHolding;
			const isHoldSubmitting =
				this.placeState.holdSubmitting && this.placeState.holdSubmittingPlaceId === selectedPlace.id;
			const isReleaseSubmitting =
				this.placeState.releaseSubmitting && this.placeState.releaseSubmittingPlaceId === selectedPlace.id;
			const holdButtonLabel = isHoldSubmitting ? "確保中" : "確保する";
			const releaseButtonLabel = isReleaseSubmitting ? "解放中" : "解放する";
			const playStarting =
				!!holdPlace &&
				this.placeState.playStarting &&
				this.placeState.playStartingHoldPlaceId === holdPlace.id;
			const playEnding =
				!!holdPlace && this.placeState.playEnding && this.placeState.playEndingHoldPlaceId === holdPlace.id;
			const joinUrl = holdPlace
				? new URL(`/play/${encodeURIComponent(holdPlace.id)}`, location.origin).toString()
				: "";
			const currentGameTitle = fixedGameTitle;
			const currentGameDescription = fixedGameDescription;
			const currentGameDescriptionMarkup = currentGameDescription
				? `<div class="small text-secondary mb-2">${utils.escapeHtml(currentGameDescription)}</div>`
				: "";
			const fixedGameDescriptionMarkup = fixedGameDescription
				? `<div class="small text-secondary mb-2">${utils.escapeHtml(fixedGameDescription)}</div>`
				: "";
			const expireText = this.formatDateTime(holdPlace?.expireAt);
			let playMarkup = "";
			if (status === "playing" && holdPlace && !holdPlaceLoading && !holdPlaceError) {
				if (holdPlace.currentPlayId) {
					playMarkup = `
						<div class="mt-3 p-3 border rounded-3 bg-light">
							<div class="fw-semibold mb-1">${utils.escapeHtml(currentGameTitle)}</div>
							<div class="small text-muted mb-2">Play ID: ${utils.escapeHtml(holdPlace.currentPlayId)}</div>
							${currentGameDescriptionMarkup}
							${expireText ? `<div class="small text-muted mb-2">このPlayは ${utils.escapeHtml(expireText)} まで遊べます。</div>` : ""}
							<div class="small text-break mb-2">${utils.escapeHtml(joinUrl)}</div>
							<div class="d-flex flex-wrap gap-2">
								<button id="place-copy-play-button" class="btn btn-outline-secondary btn-sm" data-url="${utils.escapeHtml(
									joinUrl,
								)}" type="button">URLをコピー</button>
								${
									isSelfHolding
										? `<button id="place-end-play-button" class="btn btn-outline-secondary btn-sm" data-hold-place-id="${utils.escapeHtml(
												holdPlace.id,
											)}" ${playEnding ? "disabled" : ""} type="button">${
												playEnding ? "終了中..." : "Play終了"
											}</button>`
										: ""
								}
							</div>
						</div>
					`;
				} else if (isSelfHolding) {
					playMarkup = `
						<div class="mt-3 p-3 border rounded-3 bg-light">
							<div class="fw-semibold mb-1">${utils.escapeHtml(fixedGameTitle)}</div>
							${fixedGameDescriptionMarkup}
							<button id="place-start-play-button" class="btn btn-primary btn-sm" data-place-id="${utils.escapeHtml(
								selectedPlace.id,
							)}" ${playStarting ? "disabled" : ""} type="button">${playStarting ? "開始中..." : "遊ぶ"}</button>
						</div>
					`;
				}
			}
			let ownerLabel = "";
			if (status === "playing") {
				if (holdPlaceLoading) {
					ownerLabel = "確保者を確認中...";
				} else if (holdPlaceError) {
					ownerLabel = "確保者の取得に失敗しました。";
				} else if (isSelfHolding) {
					ownerLabel = "自分が確保済";
				} else if (holdOwnerId) {
					ownerLabel = "他のユーザーが確保済";
				} else {
					ownerLabel = "システムが確保済";
				}
			}
			bodyMarkup = `
				<div class="d-flex justify-content-between align-items-center mb-2">
					<div>
						<div class="small text-muted">Place</div>
						<div class="fw-semibold">${utils.escapeHtml(selectedPlace.name)}</div>
						<div class="small text-muted">ID: ${utils.escapeHtml(selectedPlace.id)}</div>
					</div>
					<span class="badge ${statusBadgeClass}">${statusLabel}</span>
				</div>
				<div class="small text-secondary">${statusText}</div>
				<div class="small text-muted">${holdText}</div>
				${ownerLabel ? `<div class="small text-muted">${utils.escapeHtml(ownerLabel)}</div>` : ""}
				${
					isHoldable
						? `<div class="mt-3 text-center"><button id="place-hold-button" class="btn btn-primary" data-place-id="${utils.escapeHtml(
								selectedPlace.id,
							)}" ${isHoldSubmitting ? "disabled" : ""}>${holdButtonLabel}</button></div>`
						: ""
				}
				${
					isReleasable
						? `<div class="mt-3 text-center"><button id="place-release-button" class="btn btn-outline-secondary" data-place-id="${utils.escapeHtml(
								selectedPlace.id,
							)}" ${isReleaseSubmitting ? "disabled" : ""}>${releaseButtonLabel}</button></div>`
						: ""
				}
				${playMarkup}
			`;
		}

		return `
			<div class="card mt-3">
				<div class="card-body">
					${bodyMarkup}
				</div>
			</div>
		`;
	}

	stopSelectedPlaceWatch() {
		if (this.placeWatchUnsub) {
			this.placeWatchUnsub();
		}
		this.placeWatchUnsub = null;
		this.placeWatchId = null;
	}

	stopSelectedHoldPlaceWatch() {
		if (this.holdPlaceWatchUnsub) {
			this.holdPlaceWatchUnsub();
		}
		this.holdPlaceWatchUnsub = null;
		this.holdPlaceWatchId = null;
	}

	syncSelectedPlaceWatch(placeId: string | null) {
		if (!placeId) {
			if (this.placeWatchId) this.stopSelectedPlaceWatch();
			if (this.holdPlaceWatchId) this.stopSelectedHoldPlaceWatch();
			if (
				this.placeState.placeId ||
				this.placeState.selectedPlace ||
				this.placeState.selectedPlaceLoading ||
				this.placeState.selectedPlaceError ||
				this.placeState.selectedHoldPlace ||
				this.placeState.selectedHoldPlaceLoading ||
				this.placeState.selectedHoldPlaceError ||
				this.placeState.ignoreHoldPlaceId ||
				this.placeState.holdSubmitting ||
				this.placeState.holdSubmittingPlaceId ||
				this.placeState.releaseSubmitting ||
				this.placeState.releaseSubmittingPlaceId ||
				this.placeState.playStarting ||
				this.placeState.playStartingHoldPlaceId ||
				this.placeState.playEnding ||
				this.placeState.playEndingHoldPlaceId
			) {
				this.placeState = {
					...this.placeState,
					placeId: null,
					selectedPlace: null,
					selectedPlaceLoading: false,
					selectedPlaceError: null,
					selectedHoldPlace: null,
					selectedHoldPlaceLoading: false,
					selectedHoldPlaceError: null,
					ignoreHoldPlaceId: null,
					holdSubmitting: false,
					holdSubmittingPlaceId: null,
					releaseSubmitting: false,
					releaseSubmittingPlaceId: null,
					playStarting: false,
					playStartingHoldPlaceId: null,
					playEnding: false,
					playEndingHoldPlaceId: null,
				};
			}
			return;
		}

		if (this.placeState.placeId !== placeId) {
			this.placeState = {
				...this.placeState,
				placeId,
				selectedPlace: null,
				selectedPlaceLoading: true,
				selectedPlaceError: null,
				selectedHoldPlace: null,
				selectedHoldPlaceLoading: false,
				selectedHoldPlaceError: null,
				ignoreHoldPlaceId: null,
				holdSubmitting: false,
				holdSubmittingPlaceId: null,
				releaseSubmitting: false,
				releaseSubmittingPlaceId: null,
				playStarting: false,
				playStartingHoldPlaceId: null,
				playEnding: false,
				playEndingHoldPlaceId: null,
			};
		}

		const selectedPlace =
			this.placeState.selectedPlace && this.placeState.selectedPlace.id === placeId
				? this.placeState.selectedPlace
				: null;

		if (!selectedPlace) {
			if (this.holdPlaceWatchId) {
				this.stopSelectedHoldPlaceWatch();
			}
			if (
				this.placeState.selectedHoldPlace ||
				this.placeState.selectedHoldPlaceError ||
				this.placeState.selectedHoldPlaceLoading
			) {
				this.placeState = {
					...this.placeState,
					selectedHoldPlace: null,
					selectedHoldPlaceLoading: false,
					selectedHoldPlaceError: null,
				};
			}

			if (this.placeWatchId === placeId) {
				return;
			}

			this.stopSelectedPlaceWatch();

			const watchId = placeId;
			this.placeWatchId = watchId;
			this.placeState = {
				...this.placeState,
				selectedPlace: null,
				selectedPlaceLoading: true,
				selectedPlaceError: null,
				ignoreHoldPlaceId: null,
			};

			this.placeWatchUnsub = watchPlace(
				this.firebase.firestore,
				watchId,
				(place) => {
					if (this.placeWatchId !== watchId) return;
					if (!place) {
						this.placeState = {
							...this.placeState,
							selectedPlace: null,
							selectedPlaceLoading: false,
							selectedPlaceError: "選択したPlaceが見つかりません。",
						};
						this.render();
						return;
					}
					let nextIgnoreHoldPlaceId = this.placeState.ignoreHoldPlaceId;
					if (nextIgnoreHoldPlaceId && place.currentHoldPlaceId !== nextIgnoreHoldPlaceId) {
						nextIgnoreHoldPlaceId = null;
					}
					this.placeState = {
						...this.placeState,
						selectedPlace: place,
						selectedPlaceLoading: false,
						selectedPlaceError: null,
						ignoreHoldPlaceId: nextIgnoreHoldPlaceId,
					};
					this.render();
				},
				() => {
					if (this.placeWatchId !== watchId) return;
					this.placeState = {
						...this.placeState,
						selectedPlaceLoading: false,
						selectedPlaceError: "Placeの監視に失敗しました。",
					};
					this.render();
				},
			);
			return;
		}

		let holdPlaceId = selectedPlace.currentHoldPlaceId;
		if (holdPlaceId && holdPlaceId === this.placeState.ignoreHoldPlaceId) {
			holdPlaceId = undefined;
		}
		if (holdPlaceId) {
			if (this.placeWatchId) this.stopSelectedPlaceWatch();
			if (this.holdPlaceWatchId === holdPlaceId) {
				return;
			}

			this.stopSelectedHoldPlaceWatch();
			this.holdPlaceWatchId = holdPlaceId;
			this.placeState = {
				...this.placeState,
				selectedPlace,
				selectedPlaceLoading: false,
				selectedPlaceError: null,
				selectedHoldPlace: null,
				selectedHoldPlaceLoading: true,
				selectedHoldPlaceError: null,
			};

			const watchHoldId = holdPlaceId;
			const watchPlaceId = selectedPlace.id;
			this.holdPlaceWatchUnsub = watchHoldPlace(
				this.firebase.firestore,
				watchHoldId,
				(holdPlace) => {
					if (this.holdPlaceWatchId !== watchHoldId) return;
					if (!holdPlace) {
						const baseSelectedPlace =
							this.placeState.selectedPlace?.id === watchPlaceId
								? this.placeState.selectedPlace
								: selectedPlace;
						this.placeState = {
							...this.placeState,
							ignoreHoldPlaceId: watchHoldId,
							selectedHoldPlace: null,
							selectedHoldPlaceLoading: false,
							selectedHoldPlaceError: "HoldPlaceが見つかりません。",
							selectedPlace: baseSelectedPlace
								? { ...baseSelectedPlace, currentHoldPlaceId: undefined }
								: null,
						};
						this.stopSelectedHoldPlaceWatch();
						this.render();
						return;
					}

					if (holdPlace.endedAt) {
						const baseSelectedPlace =
							this.placeState.selectedPlace?.id === watchPlaceId
								? this.placeState.selectedPlace
								: selectedPlace;
						this.placeState = {
							...this.placeState,
							ignoreHoldPlaceId: watchHoldId,
							selectedHoldPlace: holdPlace,
							selectedHoldPlaceLoading: false,
							selectedHoldPlaceError: null,
							selectedPlace: baseSelectedPlace
								? { ...baseSelectedPlace, currentHoldPlaceId: undefined }
								: null,
						};
						this.stopSelectedHoldPlaceWatch();
						this.render();
						return;
					}

					if (holdPlace.currentPlayId) {
						this.navigateToPlay(watchHoldId);
						return;
					}

					const baseSelectedPlace =
						this.placeState.selectedPlace?.id === watchPlaceId
							? this.placeState.selectedPlace
							: selectedPlace;
					this.placeState = {
						...this.placeState,
						selectedPlace: baseSelectedPlace
							? { ...baseSelectedPlace, currentHoldPlaceId: watchHoldId }
							: null,
						selectedHoldPlace: holdPlace,
						selectedHoldPlaceLoading: false,
						selectedHoldPlaceError: null,
					};
					this.render();
				},
				() => {
					if (this.holdPlaceWatchId !== watchHoldId) return;
					this.placeState = {
						...this.placeState,
						selectedHoldPlaceLoading: false,
						selectedHoldPlaceError: "HoldPlaceの監視に失敗しました。",
					};
					this.render();
				},
			);
			return;
		}

		if (this.holdPlaceWatchId) {
			this.stopSelectedHoldPlaceWatch();
		}
		if (
			this.placeState.selectedHoldPlace ||
			this.placeState.selectedHoldPlaceError ||
			this.placeState.selectedHoldPlaceLoading
		) {
			this.placeState = {
				...this.placeState,
				selectedHoldPlace: null,
				selectedHoldPlaceLoading: false,
				selectedHoldPlaceError: null,
			};
		}

		if (this.placeWatchId === selectedPlace.id) {
			return;
		}

		this.stopSelectedPlaceWatch();

		const watchId = selectedPlace.id;
		this.placeWatchId = watchId;
		this.placeState = {
			...this.placeState,
			selectedPlace,
			selectedPlaceLoading: true,
			selectedPlaceError: null,
		};

		this.placeWatchUnsub = watchPlace(
			this.firebase.firestore,
			watchId,
			(place) => {
				if (this.placeWatchId !== watchId) return;
				if (!place) {
					this.placeState = {
						...this.placeState,
						selectedPlace: null,
						selectedPlaceLoading: false,
						selectedPlaceError: "選択したPlaceが見つかりません。",
					};
					this.render();
					return;
				}
				let nextIgnoreHoldPlaceId = this.placeState.ignoreHoldPlaceId;
				if (nextIgnoreHoldPlaceId && place.currentHoldPlaceId !== nextIgnoreHoldPlaceId) {
					nextIgnoreHoldPlaceId = null;
				}
				this.placeState = {
					...this.placeState,
					selectedPlace: place,
					selectedPlaceLoading: false,
					selectedPlaceError: null,
					ignoreHoldPlaceId: nextIgnoreHoldPlaceId,
				};
				this.render();
			},
			() => {
				if (this.placeWatchId !== watchId) return;
				this.placeState = {
					...this.placeState,
					selectedPlaceLoading: false,
					selectedPlaceError: "Placeの監視に失敗しました。",
				};
				this.render();
			},
		);
	}

	async handleHoldPlace(placeId: string) {
		if (this.placeState.holdSubmitting) return;
		this.placeState = {
			...this.placeState,
			holdSubmitting: true,
			holdSubmittingPlaceId: placeId,
		};
		this.render();
		try {
			await holdPlace(this.client, placeId);
			this.showToast("確保しました。", "success");
			this.topState = {
				...this.topState,
				loaded: false,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "確保に失敗しました。";
			this.showToast(message, "error");
		} finally {
			if (this.placeState.holdSubmittingPlaceId === placeId) {
				this.placeState = {
					...this.placeState,
					holdSubmitting: false,
					holdSubmittingPlaceId: null,
				};
				this.render();
			}
		}
	}

	async handleReleasePlace(placeId: string) {
		if (this.placeState.releaseSubmitting) return;
		this.placeState = {
			...this.placeState,
			releaseSubmitting: true,
			releaseSubmittingPlaceId: placeId,
		};
		this.render();
		try {
			await releasePlace(this.client, placeId);
			this.showToast("解放しました。", "success");
			const currentHoldPlaceId = this.placeState.selectedPlace?.currentHoldPlaceId;
			if (currentHoldPlaceId) {
				this.stopSelectedHoldPlaceWatch();
				this.placeState = {
					...this.placeState,
					selectedPlace: this.placeState.selectedPlace
						? { ...this.placeState.selectedPlace, currentHoldPlaceId: undefined }
						: this.placeState.selectedPlace,
					selectedHoldPlace: null,
					selectedHoldPlaceLoading: false,
					selectedHoldPlaceError: null,
					ignoreHoldPlaceId: currentHoldPlaceId,
				};
				this.render();
			}
			this.topState = {
				...this.topState,
				loaded: false,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "解放に失敗しました。";
			this.showToast(message, "error");
		} finally {
			if (this.placeState.releaseSubmittingPlaceId === placeId) {
				this.placeState = {
					...this.placeState,
					releaseSubmitting: false,
					releaseSubmittingPlaceId: null,
				};
				this.render();
			}
		}
	}

	async handleStartPlacePlay(placeId: string) {
		const holdPlaceId = this.placeState.selectedHoldPlace?.id ?? null;
		if (this.placeState.playStarting || !holdPlaceId) return;
		this.placeState = {
			...this.placeState,
			playStarting: true,
			playStartingHoldPlaceId: holdPlaceId,
		};
		this.render();
		try {
			const response = await startPlacePlay(this.client, placeId);
			this.showToast("ゲームを開始しました。", "success");
			const joinPath = response.data.joinPath;
			if (joinPath) {
				this.navigateToPlay(holdPlaceId);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "ゲーム開始に失敗しました。";
			this.showToast(message, "error");
		} finally {
			if (this.placeState.playStartingHoldPlaceId === holdPlaceId) {
				this.placeState = {
					...this.placeState,
					playStarting: false,
					playStartingHoldPlaceId: null,
				};
				this.render();
			}
		}
	}

	navigateToPlay(holdPlaceId: string) {
		const route = utils.parseRoute();
		if (route.name === "play" && route.holdPlaceId === holdPlaceId) return;
		utils.navigateTo(`/play/${encodeURIComponent(holdPlaceId)}`);
	}

	async handleEndHoldPlacePlay(holdPlaceId: string) {
		if (this.placeState.playEnding || this.playLaunchState.ending) return;
		this.placeState = {
			...this.placeState,
			playEnding: true,
			playEndingHoldPlaceId: holdPlaceId,
		};
		this.playLaunchState = {
			...this.playLaunchState,
			ending: this.playLaunchState.holdPlaceId === holdPlaceId,
		};
		this.render();
		try {
			const response = await endHoldPlacePlay(this.client, holdPlaceId);
			this.showToast("Playを終了しました。", "success");
			if (this.playLaunchState.holdPlaceId === holdPlaceId) {
				this.playLaunchState = {
					...this.playLaunchState,
					loaded: false,
					launch: null,
				};
				const placeId = response.data.placeId;
				utils.navigateTo(placeId ? `/place/${encodeURIComponent(placeId)}` : "/");
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Play終了に失敗しました。";
			this.showToast(message, "error");
		} finally {
			if (this.placeState.playEndingHoldPlaceId === holdPlaceId) {
				this.placeState = {
					...this.placeState,
					playEnding: false,
					playEndingHoldPlaceId: null,
				};
			}
			if (this.playLaunchState.holdPlaceId === holdPlaceId) {
				this.playLaunchState = {
					...this.playLaunchState,
					ending: false,
				};
			}
			this.render();
		}
	}

	async loadPlaces() {
		if (this.topState.loading || this.topState.loaded) return;
		this.topState = { ...this.topState, loading: true, error: null };
		try {
			const places = await getPlaces(this.firebase.firestore);
			this.topState = {
				...this.topState,
				places,
				loading: false,
				loaded: true,
				error: null,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "Placeの取得に失敗しました。";
			this.topState = {
				...this.topState,
				loading: false,
				loaded: true,
				error: message,
			};
		} finally {
			if (!this.state.profileLoading) {
				this.render();
			}
		}
	}

	bindTopEvents() {
		const stageEl = this.rootEl.querySelector<HTMLElement>("#top-grid-stage");
		const viewportEl = this.rootEl.querySelector<HTMLElement>("#top-grid-viewport");
		if (!stageEl || !viewportEl) return;

		const places = this.topState.places;
		const gridMetrics = this.getGridMetrics(places);
		const tapThresholdPx = 6;
		const tapMaxDistance = 0.75;
		this.scheduleTopGridLayout(gridMetrics);

		stageEl.addEventListener("pointerdown", (event) => {
			if (event.pointerType === "mouse" && event.button !== 0) return;
			const camera = this.resolveTopCamera(gridMetrics);
			this.topPointerState = {
				pointerId: event.pointerId,
				startClientX: event.clientX,
				startClientY: event.clientY,
				startCameraX: camera.cameraX,
				startCameraY: camera.cameraY,
				moved: false,
			};
			stageEl.setPointerCapture(event.pointerId);
		});

		stageEl.addEventListener("pointermove", (event) => {
			if (this.topPointerState.pointerId !== event.pointerId) return;
			const metrics = this.readTopLayoutMetrics(stageEl);
			const diffX = event.clientX - this.topPointerState.startClientX;
			const diffY = event.clientY - this.topPointerState.startClientY;
			const moved = Math.abs(diffX) > tapThresholdPx || Math.abs(diffY) > tapThresholdPx;
			if (moved && !this.topPointerState.moved) {
				this.topPointerState = {
					...this.topPointerState,
					moved: true,
				};
			}

			const nextCamera = this.clampTopCamera(
				this.topPointerState.startCameraX - diffX / metrics.tileStrideX,
				this.topPointerState.startCameraY - diffY / metrics.tileStrideY,
				gridMetrics,
			);
			this.topState = {
				...this.topState,
				cameraX: nextCamera.cameraX,
				cameraY: nextCamera.cameraY,
			};
			this.applyTopGridCamera();
		});

		const onPointerEnd = (event: PointerEvent, cancelled: boolean) => {
			if (this.topPointerState.pointerId !== event.pointerId) return;
			const pointerState = this.topPointerState;
			this.topPointerState = {
				...this.topPointerState,
				pointerId: null,
				moved: false,
			};
			if (stageEl.hasPointerCapture(event.pointerId)) {
				stageEl.releasePointerCapture(event.pointerId);
			}

			const camera = this.resolveTopCamera(gridMetrics);
			this.topState = {
				...this.topState,
				cameraX: camera.cameraX,
				cameraY: camera.cameraY,
			};
			this.applyTopGridCamera();
			if (!cancelled) {
				this.updateTopCameraUrl(camera.cameraX, camera.cameraY);
			}

			if (cancelled || pointerState.moved || places.length === 0) return;

			const metrics = this.readTopLayoutMetrics(stageEl);
			const rect = viewportEl.getBoundingClientRect();
			const worldX = camera.cameraX + (event.clientX - (rect.left + rect.width / 2)) / metrics.tileStrideX;
			const worldY = camera.cameraY + (event.clientY - (rect.top + rect.height / 2)) / metrics.tileStrideY;

			let nearestPlace: Place | null = null;
			let nearestDistance = Number.POSITIVE_INFINITY;
			for (const place of places) {
				const distance = Math.hypot(place.x - worldX, place.y - worldY);
				if (distance < nearestDistance) {
					nearestDistance = distance;
					nearestPlace = place;
				}
			}
			if (nearestPlace && nearestDistance <= tapMaxDistance) {
				utils.navigateTo(`/place/${encodeURIComponent(nearestPlace.id)}`);
			}
		};

		stageEl.addEventListener("pointerup", (event) => {
			onPointerEnd(event, false);
		});
		stageEl.addEventListener("pointercancel", (event) => {
			onPointerEnd(event, true);
		});
	}

	bindPlaceEvents() {
		const backButton = this.rootEl.querySelector<HTMLButtonElement>("#place-back");
		if (backButton) {
			backButton.addEventListener("click", () => {
				utils.navigateTo("/");
			});
		}

		const holdButton = this.rootEl.querySelector<HTMLButtonElement>("#place-hold-button");
		if (holdButton) {
			holdButton.addEventListener("click", () => {
				const placeId = holdButton.dataset.placeId;
				if (!placeId) return;
				void this.handleHoldPlace(placeId);
			});
		}

		const releaseButton = this.rootEl.querySelector<HTMLButtonElement>("#place-release-button");
		if (releaseButton) {
			releaseButton.addEventListener("click", () => {
				const placeId = releaseButton.dataset.placeId;
				if (!placeId) return;
				void this.handleReleasePlace(placeId);
			});
		}

		const startPlayButton = this.rootEl.querySelector<HTMLButtonElement>("#place-start-play-button");
		if (startPlayButton) {
			startPlayButton.addEventListener("click", () => {
				const placeId = startPlayButton.dataset.placeId;
				if (!placeId) return;
				void this.handleStartPlacePlay(placeId);
			});
		}

		const copyPlayButton = this.rootEl.querySelector<HTMLButtonElement>("#place-copy-play-button");
		if (copyPlayButton) {
			copyPlayButton.addEventListener("click", async () => {
				const url = copyPlayButton.dataset.url;
				if (!url) return;
				try {
					await navigator.clipboard.writeText(url);
					this.showToast("URLをコピーしました。", "success");
				} catch (err) {
					console.error(err);
					this.showToast("URLのコピーに失敗しました。", "error");
				}
			});
		}

		const endPlayButton = this.rootEl.querySelector<HTMLButtonElement>("#place-end-play-button");
		if (endPlayButton) {
			endPlayButton.addEventListener("click", () => {
				const holdPlaceId = endPlayButton.dataset.holdPlaceId;
				if (!holdPlaceId) return;
				void this.handleEndHoldPlacePlay(holdPlaceId);
			});
		}
	}

	bindPlayEvents() {
		const backButton = this.rootEl.querySelector<HTMLButtonElement>("#play-back");
		if (backButton) {
			backButton.addEventListener("click", () => {
				const placeId = backButton.dataset.placeId;
				utils.navigateTo(placeId ? `/place/${encodeURIComponent(placeId)}` : "/");
			});
		}

		const frame = this.rootEl.querySelector<HTMLIFrameElement>("#play-frame");
		if (frame) {
			frame.addEventListener("load", () => {
				window.setTimeout(() => this.postPlayLaunchConfig(), 0);
			});
		}

		const copyUrlButton = this.rootEl.querySelector<HTMLButtonElement>("#play-copy-url-button");
		if (copyUrlButton) {
			copyUrlButton.addEventListener("click", async () => {
				const url = copyUrlButton.dataset.url;
				if (!url) return;
				try {
					await navigator.clipboard.writeText(url);
					this.showToast("URLをコピーしました。", "success");
				} catch (err) {
					console.error(err);
					this.showToast("URLのコピーに失敗しました。", "error");
				}
			});
		}

		const endButton = this.rootEl.querySelector<HTMLButtonElement>("#play-end-button");
		if (endButton) {
			endButton.addEventListener("click", () => {
				const holdPlaceId = endButton.dataset.holdPlaceId;
				if (!holdPlaceId) return;
				void this.handleEndHoldPlacePlay(holdPlaceId);
			});
		}
	}

	getDefaultProfile(user: FirebaseUser): FirestoreUser {
		return {
			uid: user.uid,
			name: "未設定",
			photoURL: null,
			createdAt: null,
			updatedAt: null,
		};
	}

	renderMy() {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
			return;
		}

		if (!this.state.profileLoaded) {
			this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
			void this.loadUserProfile();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup(false);
			return;
		}

		const profile = this.state.profile ?? this.getDefaultProfile(user);

		const menuMarkup = this.renderMenuMarkup(user, profile);
		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative">
				<div class="my-card text-center">
					<h1 class="h5 mb-3" id="my-title"></h1>
					<div class="d-flex justify-content-center gap-2 mb-1">
						<span>ユーザーID:</span>
						<span id="my-user-id"></span>
					</div>
					<div class="d-flex justify-content-center gap-2 mb-4">
						<span>ユーザー名:</span>
						<span id="my-user-name"></span>
					</div>
					<button id="my-edit" class="btn btn-outline-secondary">編集</button>
				</div>
			</div>
			${menuMarkup}
		`;

		const displayName = profile.name || "未設定";
		const titleEl = utils.qsStrict<HTMLElement>("#my-title", this.rootEl);
		titleEl.textContent = `${displayName}さんのマイページ`;
		const userIdEl = utils.qsStrict<HTMLElement>("#my-user-id", this.rootEl);
		userIdEl.textContent = profile.uid;
		const userNameEl = utils.qsStrict<HTMLElement>("#my-user-name", this.rootEl);
		userNameEl.textContent = displayName;

		const editBtn = utils.qsStrict<HTMLButtonElement>("#my-edit", this.rootEl);
		editBtn.addEventListener("click", () => {
			utils.navigateTo("/my/edit");
		});

		this.bindMenuEvents(user);
	}

	renderProfileSetup(isEditRoute: boolean) {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}

		const existingName = isEditRoute ? (this.state.profile?.name ?? "") : "";
		const menuMarkup = this.renderMenuMarkup(user, this.state.profile);
		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative">
				<div class="my-card">
					<h1 class="h5 mb-3 text-center">プロフィール登録</h1>
					<form id="profile-setup-form" class="text-start">
						<div class="mb-4">
							<label class="form-label" for="profile-name">ユーザー名</label>
							<input
								id="profile-name"
								class="form-control"
								type="text"
								placeholder="名前を入力"
								autocomplete="name"
								maxlength="40"
								required
							/>
						</div>
						<div class="d-grid">
							<button id="profile-save" class="btn btn-outline-secondary" type="submit">確定</button>
						</div>
					</form>
				</div>
			</div>
			${menuMarkup}
		`;

		const form = utils.qsStrict<HTMLFormElement>("#profile-setup-form", this.rootEl);
		const nameInput = utils.qsStrict<HTMLInputElement>("#profile-name", this.rootEl);
		const saveBtn = utils.qsStrict<HTMLButtonElement>("#profile-save", this.rootEl);

		nameInput.value = existingName;
		nameInput.focus();

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const name = nameInput.value.trim();
			if (!name) {
				this.showToast("ユーザー名を入力してください。", "info");
				nameInput.focus();
				return;
			}

			saveBtn.disabled = true;
			saveBtn.textContent = "保存中...";
			try {
				await createUser(this.client, name);
				this.showToast("プロフィールを登録しました。", "success");
				this.state = {
					...this.state,
					profile: null,
					profileLoaded: false,
					profileLoading: false,
					needsProfile: false,
				};
				if (isEditRoute) {
					utils.navigateTo("/my");
					return;
				}
				this.render();
			} catch (err) {
				const message = err instanceof Error ? err.message : "ユーザー情報の登録に失敗しました。";
				this.showToast(message, "error");
			} finally {
				saveBtn.disabled = false;
				saveBtn.textContent = "確定";
			}
		});

		this.bindMenuEvents(user);
	}

	renderMyEdit() {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}

		if (this.state.profileLoading) {
			this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
			return;
		}

		if (!this.state.profileLoaded) {
			this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
			void this.loadUserProfile();
			return;
		}

		if (this.state.needsProfile) {
			this.renderProfileSetup(true);
			return;
		}

		const profile = this.state.profile ?? this.getDefaultProfile(user);
		const menuMarkup = this.renderMenuMarkup(user, profile);
		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative">
				<div class="my-card">
					<h1 class="h5 mb-3 text-center">プロフィール編集</h1>
					<form id="my-edit-form" class="text-start">
						<div class="mb-3">
							<label class="form-label" for="edit-user-id">ユーザーID</label>
							<div id="edit-user-id" class="form-control-plaintext"></div>
						</div>
						<div class="mb-4">
							<label class="form-label" for="edit-name">ユーザー名</label>
							<input
								id="edit-name"
								name="name"
								type="text"
								class="form-control"
								maxlength="40"
								required
							/>
						</div>
						<div class="d-flex justify-content-center gap-2">
							<button id="edit-save" class="btn btn-outline-secondary" type="submit">保存</button>
							<button id="edit-cancel" class="btn btn-outline-secondary" type="button">キャンセル</button>
						</div>
					</form>
				</div>
			</div>
			${menuMarkup}
		`;

		const userIdEl = utils.qsStrict<HTMLElement>("#edit-user-id", this.rootEl);
		userIdEl.textContent = profile.uid;
		const nameInput = utils.qsStrict<HTMLInputElement>("#edit-name", this.rootEl);
		nameInput.value = profile.name ?? "";

		const form = utils.qsStrict<HTMLFormElement>("#my-edit-form", this.rootEl);
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			void this.submitMyEdit(form);
		});

		const cancelButton = utils.qsStrict<HTMLButtonElement>("#edit-cancel", this.rootEl);
		cancelButton.addEventListener("click", () => {
			utils.navigateTo("/my");
		});

		this.bindMenuEvents(user);
	}

	async submitMyEdit(form: HTMLFormElement) {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}

		const nameInput = utils.qsStrict<HTMLInputElement>("#edit-name", form);
		const saveButton = utils.qsStrict<HTMLButtonElement>("#edit-save", form);
		const cancelButton = utils.qsStrict<HTMLButtonElement>("#edit-cancel", form);

		const nextName = nameInput.value.trim();
		if (!nextName) {
			this.showToast("ユーザー名を入力してください。", "info");
			nameInput.focus();
			return;
		}

		const previousLabel = saveButton.textContent ?? "保存";
		saveButton.disabled = true;
		cancelButton.disabled = true;
		saveButton.textContent = "保存中...";

		try {
			await updateUser(this.client, { name: nextName });
			const baseProfile = this.state.profile ?? this.getDefaultProfile(user);
			this.state = {
				...this.state,
				profile: {
					...baseProfile,
					uid: user.uid,
					name: nextName,
				},
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
			this.showToast("保存しました。", "success");
			utils.navigateTo("/my");
		} catch (err) {
			const message = err instanceof Error ? err.message : "ユーザー情報の更新に失敗しました。";
			this.showToast(message, "error");
		} finally {
			saveButton.disabled = false;
			cancelButton.disabled = false;
			saveButton.textContent = previousLabel;
		}
	}

	async loadUserProfile() {
		const user = this.state.user;
		if (!user || this.state.profileLoading) return;

		this.state = { ...this.state, profileLoading: true };
		try {
			const profile = await getUser(this.firebase.firestore, user.uid);
			if (!profile) {
				this.state = {
					...this.state,
					profile: null,
					profileLoaded: true,
					profileLoading: false,
					needsProfile: true,
				};
				const route = utils.parseRoute();
				if (route.name !== "my" && route.name !== "my-edit") {
					utils.navigateTo("/my");
				} else {
					this.render();
				}
				return;
			}
			this.state = {
				...this.state,
				profile,
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "ユーザー情報の取得に失敗しました。";
			this.showToast(message, "error");
			this.state = {
				...this.state,
				profileLoaded: true,
				profileLoading: false,
				needsProfile: false,
			};
		} finally {
			if (!this.topState.loading) {
				this.render();
			}
		}
	}

	bindLoginEvents() {
		const niconicoBtn = utils.qsStrict<HTMLButtonElement>("#login-niconico", this.rootEl);
		niconicoBtn.addEventListener("click", () => {
			this.showToast("機能は開発中です。", "info");
		});

		const loginBtn = utils.qsStrict<HTMLButtonElement>("#login-google", this.rootEl);
		loginBtn.addEventListener("click", async () => {
			loginBtn.disabled = true;
			loginBtn.textContent = "接続中...";
			try {
				await signInWithGoogle(this.firebase);
				this.showToast("ログインしました。", "success");
			} catch (err) {
				const message = err instanceof Error ? err.message : "ログインに失敗しました。";
				this.showToast(message, "error");
			} finally {
				loginBtn.disabled = false;
				loginBtn.textContent = "Googleでログイン";
			}
		});
	}

	renderMenuMarkup(user: FirebaseUser | null, profile: FirestoreUser | null): string {
		const isSignedIn = user !== null;
		const displayName = isSignedIn
			? (profile?.name ?? (this.state.profileLoading ? "読み込み中" : "未設定"))
			: "ゲスト";
		const userIdRow = isSignedIn ? `<li class="as-menu-item">ユーザーID: ${user.uid}</li>` : "";
		const route = utils.parseRoute();
		const isMyPage = route.name === "my" || route.name === "my-edit";
		const myPageRow = isSignedIn
			? `<li class="as-menu-item"><button id="menu-my" class="as-menu-link" type="button">${isMyPage ? "トップページ" : "マイページ"}</button></li>`
			: "";
		const authLabel = isSignedIn ? "ログアウト" : "ログイン";
		const suffix = utils.isDebugMode() ? "?debug=true" : "";
		const termsLink = `/static/terms.html${suffix}`;
		const privacyLink = `/static/privacy-policy.html${suffix}`;
		const companyLink = `/static/company.html${suffix}`;
		const creditLink = `/static/credit.html${suffix}`;

		return `
			<button id="menu-button" class="as-menu-button" type="button" aria-label="メニュー">
				<span></span>
			</button>
			<div id="menu-container" class="as-menu-container">
				<div id="menu-backdrop" class="as-menu-backdrop"></div>
				<div class="as-menu-inner">
					<div class="as-menu-header">
						<button id="menu-close" class="as-menu-close" type="button">
							<span class="as-menu-close-icon"></span>
							<span class="as-menu-close-text">閉じる</span>
						</button>
					</div>
					<ul class="as-menu-list">
						<li class="as-menu-item">ユーザー名: ${displayName}</li>
						${userIdRow}
						<li class="as-menu-item">
							<button id="menu-auth" class="as-menu-link" type="button">${authLabel}</button>
						</li>
						${myPageRow}
						<li class="as-menu-item"><a class="as-menu-link" href="${termsLink}">利用規約</a></li>
						<li class="as-menu-item"><a class="as-menu-link" href="${privacyLink}">プライバシーポリシー</a></li>
						<li class="as-menu-item"><a class="as-menu-link" href="${companyLink}">運営会社</a></li>
						<li class="as-menu-item"><a class="as-menu-link" href="${creditLink}">クレジット</a></li>
					</ul>
				</div>
			</div>
		`;
	}

	bindMenuEvents(user: FirebaseUser | null) {
		const menuContainer = utils.qsStrict<HTMLDivElement>("#menu-container", this.rootEl);
		const menuButton = utils.qsStrict<HTMLButtonElement>("#menu-button", this.rootEl);
		const menuClose = utils.qsStrict<HTMLButtonElement>("#menu-close", this.rootEl);
		const menuBackdrop = utils.qsStrict<HTMLDivElement>("#menu-backdrop", this.rootEl);
		menuButton.addEventListener("click", () => {
			menuContainer.classList.add("open");
			menuButton.classList.add("is-under");
		});
		menuClose.addEventListener("click", () => {
			menuContainer.classList.remove("open");
			menuButton.classList.remove("is-under");
		});
		menuBackdrop.addEventListener("click", () => {
			menuContainer.classList.remove("open");
			menuButton.classList.remove("is-under");
		});

		const authButton = utils.qsStrict<HTMLButtonElement>("#menu-auth", this.rootEl);
		if (user) {
			authButton.addEventListener("click", async () => {
				authButton.disabled = true;
				try {
					await signOutCurrentUser(this.firebase);
					this.showToast("ログアウトしました。", "success");
					menuContainer.classList.remove("open");
					utils.navigateTo("/login");
				} catch (err) {
					const message = err instanceof Error ? err.message : "ログアウトに失敗しました。";
					this.showToast(message, "error");
					authButton.disabled = false;
				}
			});
		} else {
			authButton.addEventListener("click", () => {
				menuContainer.classList.remove("open");
				utils.navigateTo("/login");
			});
		}

		const myPageButton = this.rootEl.querySelector<HTMLButtonElement>("#menu-my");
		if (myPageButton) {
			myPageButton.addEventListener("click", () => {
				menuContainer.classList.remove("open");
				const route = utils.parseRoute();
				const isMyPage = route.name === "my" || route.name === "my-edit";
				utils.navigateTo(isMyPage ? "/" : "/my");
			});
		}
	}

	showToast(message: string, type: "success" | "error" | "info" = "success") {
		this.toastEl.textContent = message;
		this.toastEl.className = `as-toast ${type}`;
		this.toastEl.style.opacity = "1";
		setTimeout(() => {
			this.toastEl.style.opacity = "0";
		}, 3200);
	}
}
