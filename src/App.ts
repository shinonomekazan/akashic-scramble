import { connectAuthEmulator, type User as FirebaseUser } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { Client as ApiClient } from "./api/client";
import { holdPlace, releasePlace } from "./api/places";
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

type TopState = {
	places: Place[];
	loading: boolean;
	loaded: boolean;
	error: string | null;
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
	placeWatchUnsub: (() => void) | null;
	placeWatchId: string | null;
	holdPlaceWatchUnsub: (() => void) | null;
	holdPlaceWatchId: string | null;

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

		this.topState = {
			places: [],
			loading: false,
			loaded: false,
			error: null,
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
		};

		this.placeWatchUnsub = null;
		this.placeWatchId = null;
		this.holdPlaceWatchUnsub = null;
		this.holdPlaceWatchId = null;
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
		this.render();
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
				this.placeState.releaseSubmittingPlaceId
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
				};
			}
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
		if (!user) {
			utils.navigateTo("/login");
			return;
		}
		if (user && !this.state.profileLoaded && !this.state.profileLoading) {
			void this.loadUserProfile();
		}

		if (!this.topState.loaded && !this.topState.loading) {
			void this.loadPlaces();
		}

		const { places, loading, error } = this.topState;
		const gridMetrics = this.getGridMetrics(places);

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
				<div class="top-grid-stage border rounded-3 p-3 bg-white position-relative">
					<div class="top-grid" style="--cols:${gridMetrics.cols}; --rows:${gridMetrics.rows};">
						${placeCardsMarkup}
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

	getGridMetrics(places: Place[]) {
		if (places.length === 0) {
			return { minX: 0, minY: 0, cols: 1, rows: 1 };
		}
		const xs = places.map((place) => place.x);
		const ys = places.map((place) => place.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		return {
			minX,
			minY,
			cols: maxX - minX + 1,
			rows: maxY - minY + 1,
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
				<div class="card-body p-3">
					<div class="d-flex justify-content-between align-items-center mb-2">
						<div class="fw-semibold">${utils.escapeHtml(place.name)}</div>
						<span class="badge ${statusBadgeClass}">${statusLabel}</span>
					</div>
					<div class="small text-secondary">${statusText}</div>
					<div class="small text-muted">${holdText}</div>
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
				this.placeState.releaseSubmittingPlaceId
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
			this.render();
		}
	}

	bindTopEvents() {
		const placeCards = Array.from(this.rootEl.querySelectorAll<HTMLDivElement>(".top-place-card"));
		placeCards.forEach((card) => {
			const placeId = card.dataset.placeId;
			if (!placeId) return;
			card.addEventListener("click", () => {
				utils.navigateTo(`/place/${encodeURIComponent(placeId)}`);
			});
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
			this.render();
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
		const myPageRow = isSignedIn
			? '<li class="as-menu-item"><button id="menu-my" class="as-menu-link" type="button">マイページ</button></li>'
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
				utils.navigateTo("/my");
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
