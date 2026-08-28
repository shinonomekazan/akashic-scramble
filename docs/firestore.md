# Firestoreのデータ構造

## 前提文書

[プレイヤーの状態遷移](https://github.com/shinonomekazan/akashic-docs/blob/main/planning/player-state.md)を参照。

## Type Define

[TypeScriptコード](../functions/src/types/firestore.ts)を参照。

## Structure

```
users/
	{userId}

places/
	{placeId}

holdPlaces/
	{holdPlaceId}

plays/
	{scramblePlayId}
		playTokens/
			{playTokenId}

```

1. Placeはほぼマスターデータとして機能する
	- 唯一、currentHoldPlaceIdのみが更新される
2. PlaceからHoldPlaceが生成され、一つの確保された枠を表現する
3. HoldPlaceからPlayが生成され、一つのプレイを表現する
	- PlayドキュメントIDはScramble側で発行し、Akashic System側のIDとは分離する
	- Akashic System側のIDはakashicPlayId、作成先API URLはsystemUrlに保存する
4. PlayからPlayTokenが生成され、ユーザーのプレイ権を表現する

子コレクションは現状ほぼ利用していない。ほぼ、単一フィールドインデックスで用途を網羅できそうなため。以下に代表的な検索方法を例示する。

1. 自分のHold履歴を参照する: HoldPlaceのholdUserIdで検索
2. 自分のPlay履歴を参照する: PlayのownerUserIdで検索
3. そのPlaceのHoldPlaceの履歴を参照する: HoldPlaceのplaceIdで検索
4. そのHoldPlaceのPlay履歴を参照する: PlayのholdPlaceIdで検索

複合インデックスが必要なケースは、以下のようなもの。

1. そのコンテンツが現在遊ばれているHoldPlaceを検索する: PlayのproviderIdとcontentCodeとstateで検索

## 利用シーン別の使い方

### そのPlaceの状態を確認する

PlaceのcurrentHoldPlaceIdを参照する。

### そのPlaceを確保（Hold）する

1. Placeのbehavioursに応じてHoldPlaceを生成
2. PlaceのcurrentHoldPlaceIdに値を入れる

### Playを作成する

1. HoldPlaceのbehavioursに応じてPlayを生成
2. HoldPlaceのcurrentPlayIdに値を入れる
3. currentPlayIdにはScramble側Play IDを入れ、Akashic Play IDを入れない

既存データとの互換性のため、akashicPlayIdが無いPlayはドキュメントIDをAkashic Play IDとして扱い、systemUrlが無いPlayはlegacy用Akashic System URLへ接続する。

### Playに参加する

1. ユーザーのログイン状態と、PlayのownerUserId、PlayのdefaultPermissionを元にPlayTokenを作成

### プレイを開始する

1. PlayのjoinedPlayerIdsを更新する
2. Play Eventとしてjoinを発行

後述するPlayの状態変化の監視で、joinedPlayerIdsの変化を監視しておけば、現在のJoinedPlayerの変化を検知することも可能。

※「プレイ」なのは誤字ではなく、Playに参加する = Playerになる事を意味し、JoinedPlayerとしてPlayに参加するを表す用語として現状は「プレイを開始」というのが使われているため。

### プレイを停止する

1. PlayのjoinedPlayerIdsを更新する
2. Play Eventとしてleaveを発行

後述するPlayの状態変化の監視で、joinedPlayerIdsの変化を監視しておけば、現在のJoinedPlayerの変化を検知することも可能。

### Placeの状態変化を監視する

1. Placeをwatchする
2. PlaceのcurrentHoldPlaceIdの値の変化で検知する

### HoldPlaceの状態変化を監視する

1. HoldPlaceをwatchする
2. HoldPlaceのcurrentPlayIdの値の変化で、プレー状態を検知する
3. HoldPlaceのendedAtの値の変化で、HoldPlaceの終了を検知する

HoldPlaceを監視している際、Placeのwatchを不要なので、二重監視を避けるように実装する事。

### Playの状態変化を監視する

1. Playをwatchする
2. Playのstateを見てPlayの終了を検知する

Playの監視中にHoldPlaceは監視することはありえるが、PlayのstateはHoldPlaceの状態変更で変化する事を保証し、極力二重監視はしないで済むよう実装する。

### タイルでのPlace状態

タイルUIでPlaceの状態を一括監視するには、すべてのPlaceをwatchしなければならないので非常に効率が悪い。

当初タイルUIでのリアルタイム状態変化は行わないものとするが、将来的にはTileを作り、そのTileに含まれるPlaceの状態はそのTileの監視のみでできるようにしたい。

Tileに含まれるPlaceの情報は、Tileドキュメント単体に全て記載され、単一ドキュメントのwatchで複数Placeの状態を監視できるものとする。TileドキュメントはCloud Firestore triggersによって、やや時間差のある形で反映される形を想定する。

リアルタイム監視を行う事になったら詳細実装に移るものとする。
