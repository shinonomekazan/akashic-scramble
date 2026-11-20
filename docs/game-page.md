# ゲームページの配置

Play画面は、ゲームページ（Akashicのゲームを動かすページ）をiframeで読み込み、Playトークンやcontent.jsonのURL等をpostMessageで渡す。
ゲームページはHostingの `public/contents/` に置いている。ゲーム本体とエンジンはGame Driveから読むため、Scrambleには置かない。

## 置き場所とURL

- ゲームページ: `public/contents/index.html`（`https://akashic-scramble.firebaseapp.com/contents/index.html`）
- ゲーム: Game Driveのcontent.json（`drive.akashic.shinonomekazan.com`）。エンジンもcontent.jsonの指定でGame Driveから読まれる。

Functionsは `AKASHIC_SYSTEM_GAME_PAGE_URL` のURLをPlay画面へ返す。
Play開始時はGame DriveのAPIでコンテンツIDからcontent.jsonのURLを引くため、`GAME_DRIVE_API_KEY` が必要。
ゲームを選べるようになるまでは、Game Drive上のrocket-gameを固定で使う（`functions/src/services/playContent.ts`）。

## 別ドメインにしている理由

本体（`akashic-scramble.web.app`）ではなく `firebaseapp.com` 側を指すのは、投稿ゲーム（他人のプログラム）をScramble本体と同じドメインで動かさないため。
同じoriginだと、ゲームのスクリプトからFirebase Authのログイン情報（IndexedDB）を読めてしまう。
`web.app` と `firebaseapp.com` はPublic Suffix Listで別サイトとして扱われるため、この経路はふさがる。

ただし `firebaseapp.com` はFirebase Authの `authDomain` でもあり、ログイン用のページやiframeと同じoriginになる。
完全な分離ではないため、これは当面の措置とする。投稿コンテンツを安全に動かす仕組み（専用ドメイン、iframeのsandbox、CSP等）は別途検討する。

## 取り込み元

`shinonomekazan/akashic-system-multiplayer-server` の `volumes/akashic-resources/contents/`（main `82abecd`）から、`index.html` と `dist/index.js` をそのまま写している。
取り込み元を更新したときは、同じ場所へ写し直す。

## 既知の制限

- ゲームページ内の「Session Console」リンク（`/contents/sessions.html`）は取り込んでいないため開けない。
- ゲームページを直接開いたときの既定のcontent.json（`/contents/rocket-game/content.json`）は置いていないため、Play画面を通さずに開くとゲームは読み込めない。
- Hostingのプレビューチャンネル（PRごとのURL）でも、ゲームページは本番の `firebaseapp.com` 側が読み込まれる。
