# ゲームページの配置

Play画面は、ゲームページ（Akashicのゲームを動かすページ）をiframeで読み込み、Playトークン等をpostMessageで渡す。
ゲームページはHostingの `public/contents/` に置いている。

## 置き場所とURL

- ゲームページ: `public/contents/index.html`（`https://akashic-scramble.firebaseapp.com/contents/index.html`）
- 既定ゲーム（rocket-game）: `public/contents/rocket-game/`
- エンジン: `public/contents/engines/akashic-runtime/3.13.4-0/`（rocket-gameの `content.json` が参照する2ファイルのみ）

Functionsは `AKASHIC_SYSTEM_GAME_PAGE_URL` のURLをPlay画面へ返す。
本体（`akashic-scramble.web.app`）ではなく `firebaseapp.com` 側を指すのは、投稿ゲーム（他人のプログラム）をScramble本体と同じドメインで動かさないため。
同じoriginだと、ゲームのスクリプトからFirebase Authのログイン情報（IndexedDB）を読めてしまう。
`web.app` と `firebaseapp.com` はPublic Suffix Listで別サイトとして扱われるため、この経路はふさがる。

ただし `firebaseapp.com` はFirebase Authの `authDomain` でもあり、ログイン用のページやiframeと同じoriginになる。
完全な分離ではないため、これは当面の措置とする。投稿コンテンツを安全に動かす仕組み（専用ドメイン、iframeのsandbox、CSP等）は別途検討する。

## 取り込み元

`shinonomekazan/akashic-system-multiplayer-server` の `volumes/akashic-resources/`（main `82abecd`）から、次をそのまま写している。

| 取り込み元 | 置き場所 |
| --- | --- |
| `contents/index.html`, `contents/dist/index.js` | `public/contents/` |
| `rocket-game/`（`content.json`, `game.json`, `script/`, `image/`, `audio/` のうち使うもの） | `public/contents/rocket-game/` |
| `engines/akashic-runtime/3.13.4-0/` の `engineFilesV3_13_4.js`, `playlogClientV7_3_1.js`, `MANIFEST.md` | `public/contents/engines/akashic-runtime/3.13.4-0/` |

旧サーバーのnginxは `/contents/rocket-game/` と `/contents/engines/` を別ディレクトリへ振り分けていたため、Hostingではその公開パスに合わせて配置している。
取り込み元を更新したときは、同じ対応で写し直す。

## 既知の制限

- ゲームページ内の「Session Console」リンク（`/contents/sessions.html`）は取り込んでいないため開けない。
- Hostingのプレビューチャンネル（PRごとのURL）でも、ゲームページは本番の `firebaseapp.com` 側が読み込まれる。
