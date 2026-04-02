import { App } from "./App";
import { watchAuthChanges, type User as FirebaseUser } from "./auth";
import * as utils from "./utils";
import { manage } from "./resolvers";
import * as apiManage from "./api/manage";

type ManageMenuItem = {
	label: string;
	href: string;
};

const MANAGE_MENU_ITEMS: ManageMenuItem[] = [
	{ label: "ユーザー管理", href: "" },
	{ label: "場所管理", href: "" },
	{ label: "確保場所管理", href: "" },
	{ label: "プレイ管理", href: "" },
	{ label: "管理ユーザー管理", href: "" },
];

export class Manage extends App {
	constructor() {
		super();
	}

	withAuth(defaultPath: string, callback: (user: FirebaseUser, hasPermission: boolean) => Promise<void>) {
		watchAuthChanges(this.firebase, async (user) => {
			if (user == null) {
				const loginUrl = new URL("/login", window.location.origin);
				loginUrl.searchParams.set("next", window.location.pathname || defaultPath);
				if (utils.isDebugMode()) {
					loginUrl.searchParams.set("debug", "true");
				}
				window.location.href = loginUrl.toString();
				return;
			}
			this.client.idTokenFunction = user ? () => user.getIdToken() : undefined;
			const hasPermission = await this.canUseManageTool(user);
			await callback(user, hasPermission);
		});
	}

	async canUseManageTool(user: FirebaseUser): Promise<boolean> {
		const manageUser = await manage.getManageUser(this.firebase.firestore, user.uid);
		if (manageUser?.role === "administrator") {
			await this.ensureManageClaims(user);
			return true;
		}
		return false;
	}

	async ensureManageClaims(user: FirebaseUser) {
		const tokenResult = await user.getIdTokenResult();
		if (tokenResult.claims.role === "admin") return;
		await apiManage.authenticate(this.client);
		await user.getIdToken(true);
	}

	async topPage() {
		this.withAuth("/manage/index.html", async (_user, hasPermission) => {
			this.renderManagePage(hasPermission);
		});
	}

	renderManagePage(hasPermission: boolean) {
		const errorMessage = hasPermission
			? ""
			: '<p class="manage-error-message">このツールを利用する権限がありません</p>';
		const buttonHtml = MANAGE_MENU_ITEMS.map((item) => {
			const disabledAttrs = hasPermission ? "" : 'aria-disabled="true" tabindex="-1"';
			const disabledClass = hasPermission ? "btn btn-outline-primary" : "btn btn-outline-secondary disabled";
			const href = hasPermission ? utils.escapeHtml(item.href) : "#";
			return `
					<a class="${disabledClass}" href="${href}" ${disabledAttrs}>
						${utils.escapeHtml(item.label)}
					</a>
			`;
		}).join("");

		this.rootEl.innerHTML = `
				<div class="manage-page d-flex flex-column justify-content-center align-items-center text-center px-3">
					<div class="manage-top mb-4">
						<h1 class="manage-title">
							<span class="manage-title-main">akashic-scramble</span>
							<span class="manage-title-sub">管理ツール</span>
						</h1>
						${errorMessage}
					</div>
					<div class="manage-buttons d-grid gap-3">
						${buttonHtml}
					</div>
				</div>
			`;
	}
}
