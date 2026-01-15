import { connectAuthEmulator, type User as FirebaseUser } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import { getUser } from "./resolvers";
import type { User as FirestoreUser } from "./types";
import * as utils from "./utils";
import "./css/bootstrap.min.css";

type AuthState = {
	user: FirebaseUser | null;
	loading: boolean;
	profile: FirestoreUser | null;
	profileLoaded: boolean;
	profileLoading: boolean;
};

export class App {
	firebase: FirebaseInstance;
	config: AppConfig;
	rootEl: HTMLElement;
	toastEl: HTMLElement;
	state: AuthState;

	constructor(config: AppConfig = appConfig as AppConfig) {
		this.config = config;
		this.rootEl = this.getRoot();
		this.toastEl = utils.qsStrict<HTMLElement>("#toast");
		this.firebase = initializeFirebase(this.config.firebaseConfig);
		this.connectEmulatorIfDebug();
		this.state = {
			user: null,
			loading: true,
			profile: null,
			profileLoaded: false,
			profileLoading: false,
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
		switch (route.name) {
			case "login":
				this.renderLogin();
				break;
			case "my":
				this.renderMy();
				break;
			case "top":
				this.renderTop();
				break;
			default:
				this.renderTop();
				break;
		}
	}

	renderLogin() {
		if (this.state.user) {
			utils.navigateTo("/my");
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
			this.state = { ...this.state, profileLoading: true };
			void this.loadUserProfile();
		}

		this.rootEl.innerHTML = `
			<div class="min-vh-100 position-relative"></div>
			${this.renderMenuMarkup(user, this.state.profile)}
		`;

		this.bindMenuEvents(user);
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
			this.state = { ...this.state, profileLoading: true };
			this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
			void this.loadUserProfile();
			return;
		}

		const profile = this.state.profile ?? {
			uid: user.uid,
			name: "未設定",
			photoURL: null,
			createdAt: null,
			updatedAt: null,
		};

		const menuMarkup = this.renderMenuMarkup(user, profile);
		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative">
				<button id="logout" class="btn btn-outline-secondary position-absolute top-0 end-0 m-3">ログアウト</button>
				<div class="my-card text-center">
					<h1 class="h5 mb-3" id="my-title"></h1>
					<div class="d-flex justify-content-center gap-2 mb-1">
						<span>ユーザーID</span>
						<span id="my-user-id"></span>
					</div>
					<div class="d-flex justify-content-center gap-2 mb-4">
						<span>ユーザー名</span>
						<span id="my-user-name"></span>
					</div>
					<button id="my-edit" class="btn btn-outline-dark">編集</button>
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

		const logoutBtn = utils.qsStrict<HTMLButtonElement>("#logout", this.rootEl);
		logoutBtn.addEventListener("click", async () => {
			logoutBtn.disabled = true;
			try {
				await signOutCurrentUser(this.firebase);
				this.showToast("ログアウトしました。", "success");
				utils.navigateTo("/login");
			} catch (err) {
				const message = err instanceof Error ? err.message : "ログアウトに失敗しました。";
				this.showToast(message, "error");
				logoutBtn.disabled = false;
			}
		});

		const editBtn = utils.qsStrict<HTMLButtonElement>("#my-edit", this.rootEl);
		editBtn.addEventListener("click", () => {
			this.showToast("機能は開発中です。", "info");
		});

		this.bindMenuEvents(user);
	}

	async loadUserProfile() {
		const user = this.state.user;
		if (!user) return;

		try {
			const profile = await getUser(this.firebase.firestore, user.uid);
			this.state = {
				...this.state,
				profile: profile ?? {
					uid: user.uid,
					name: "未設定",
					photoURL: null,
					createdAt: null,
					updatedAt: null,
				},
				profileLoaded: true,
				profileLoading: false,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : "ユーザー情報の取得に失敗しました。";
			this.showToast(message, "error");
			this.state = {
				...this.state,
				profile: {
					uid: user.uid,
					name: "未設定",
					photoURL: null,
					createdAt: null,
					updatedAt: null,
				},
				profileLoaded: true,
				profileLoading: false,
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
