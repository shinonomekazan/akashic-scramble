import { connectAuthEmulator, type User } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, watchAuthChanges } from "./auth";
import { appConfig } from "./config";
import type { AppConfig } from "./config.types";
import { initializeFirebase, type FirebaseInstance } from "./firebase";
import * as utils from "./utils";
import "./css/bootstrap.min.css";

type AuthState = {
	user: User | null;
	loading: boolean;
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
		};
	}

	main() {
		this.renderLoading();
		watchAuthChanges(this.firebase, (user) => {
			this.state = {
				user,
				loading: false,
			};
			this.render();
		});
		window.addEventListener("popstate", () => {
			this.render();
		});
		this.render();
	}

	private connectEmulatorIfDebug() {
		if (!utils.isDebugMode()) return;
		connectAuthEmulator(this.firebase.auth, "http://localhost:9099", { disableWarnings: true });
	}

	private getRoot(): HTMLElement {
		return utils.qsStrict<HTMLElement>("#app-root");
	}

	private renderLoading() {
		this.rootEl.innerHTML = '<div class="loading">読み込み中...</div>';
	}

	private render() {
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
			default:
				this.redirectFromRoot();
				break;
		}
	}

	private redirectFromRoot() {
		if (this.state.user) {
			utils.navigateTo("/my");
			return;
		}
		utils.navigateTo("/login");
	}

	private renderLogin() {
		if (this.state.user) {
			utils.navigateTo("/my");
			return;
		}

		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5">
				<div class="text-center">
					<h1 class="h5 mb-4">Akashic Scramble</h1>
					<div class="d-grid gap-3">
						<button id="login-niconico" class="btn btn-outline-primary">ニコニコでログイン</button>
						<button id="login-google" class="btn btn-outline-primary">Googleでログイン</button>
					</div>
				</div>
			</div>
		`;

		this.bindLoginEvents();
	}

	private renderMy() {
		const user = this.state.user;
		if (!user) {
			utils.navigateTo("/login");
			return;
		}

		this.rootEl.innerHTML = `
			<div class="min-vh-100 d-flex align-items-center justify-content-center py-5 position-relative">
				<button id="logout" class="btn btn-outline-secondary position-absolute top-0 end-0 m-3">ログアウト</button>
				<h1 class="display-4 fw-bold text-center" id="user-name"></h1>
			</div>
		`;

		const nameEl = utils.qsStrict<HTMLElement>("#user-name", this.rootEl);
		nameEl.textContent = user.displayName || user.email || "ユーザー";

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
	}

	private bindLoginEvents() {
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

	private showToast(message: string, type: "success" | "error" | "info" = "success") {
		this.toastEl.textContent = message;
		this.toastEl.className = `as-toast ${type}`;
		this.toastEl.style.opacity = "1";
		setTimeout(() => {
			this.toastEl.style.opacity = "0";
		}, 3200);
	}
}
