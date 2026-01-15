# akashic-scramble

環境変数に Firebase の設定を入れてから起動してください。

必須:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

その後、以下の手順で起動できます。

1. `npm i`
2. `npm run start:emulator`
3. `npm run build` (または `npm run build:watch`)