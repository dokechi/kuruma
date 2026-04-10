# レンタカー台帳 → GitHub ダッシュボード

Google スプレッドシートを元データにして、GitHub Pages で見やすいダッシュボードを表示する最小構成です。

## できること

- Google スプレッドシートを読み込み
- 元シートの行を `vehicles.json` に変換
- GitHub Pages のダッシュボードに反映
- GitHub Actions の定期実行 / 手動実行 / `repository_dispatch` で更新
- スマホでも見やすいレスポンシブ表示

## 前提

- このリポジトリを GitHub に置く
- GitHub Actions を有効化する
- Google Sheets API にアクセスできるサービスアカウントを用意する
- 対象スプレッドシートをサービスアカウントに共有する

## 対象スプレッドシート

このコードは、次のシート ID / gid を初期値として入れています。

- Spreadsheet ID: `1qJHYJ4rE8R-nnZPuXSkzP-kYHuZVO8_8`
- Worksheet GID: `699666833`

URL 例:

```text
https://docs.google.com/spreadsheets/d/1qJHYJ4rE8R-nnZPuXSkzP-kYHuZVO8_8/edit?gid=699666833#gid=699666833
```

## リポジトリ構成

```text
.github/workflows/sync-sheet.yml   # GitHub Actions
scripts/sync_from_gsheet.py        # スプシ → JSON 変換
requirements.txt

docs/index.html                    # GitHub Pages 画面
/docs/app.js
/docs/styles.css
/docs/data/vehicles.json           # 生成データ
/docs/data/summary.json            # 生成サマリ
```

## GitHub Secrets / Variables

### Secrets

- `GOOGLE_SERVICE_ACCOUNT_JSON`
  - サービスアカウントの JSON 全文をそのまま入れる

### Variables または workflow の env で設定可能

- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_WORKSHEET_GID`
- `GOOGLE_WORKSHEET_TITLE`（GID ではなくシート名で指定したい場合だけ）

このサンプルでは workflow 側に初期値を入れてあります。

## Google 側の準備

1. Google Cloud でサービスアカウントを作る
2. Sheets API を有効にする
3. サービスアカウント JSON キーを発行する
4. 対象スプレッドシートをそのサービスアカウントのメールアドレスに「閲覧者」で共有する
5. JSON 全文を `GOOGLE_SERVICE_ACCOUNT_JSON` に登録する

## GitHub Pages の設定

1. GitHub の `Settings` → `Pages`
2. Source を **Deploy from a branch** にする
3. Branch を `main`、Folder を `/docs` にする
4. 保存する

## 更新方法

### 1. 手動実行

GitHub の `Actions` → `Sync Google Sheet to Dashboard` → `Run workflow`

### 2. 定期実行

workflow では 30 分ごとの cron を入れています。

### 3. n8n から即時反映

n8n でスプレッドシート更新後、HTTP Request ノードで GitHub の `repository_dispatch` を叩けば即時更新できます。

#### 送信先

```text
POST https://api.github.com/repos/<OWNER>/<REPO>/dispatches
```

#### Headers

```json
{
  "Accept": "application/vnd.github+json",
  "Authorization": "Bearer <GITHUB_TOKEN>",
  "X-GitHub-Api-Version": "2022-11-28"
}
```

#### Body

```json
{
  "event_type": "sheet-updated",
  "client_payload": {
    "source": "n8n"
  }
}
```

## 元シートに対する前提

このコードは、以下のような列名を優先して読みます。

- 購入年月日
- 旧
- 新
- 名前
- 車体ナンバー
- 登録番号
- 10月〜9月の月額列
- 売却先
- 取得
- 売却
- 売却益
- 仕入ﾘｻｲｸﾙ
- 売上ﾘｻｲｸﾙ
- 預託金
- 立替金
- 保険
- 内仕入価格

また、以下のような行は自動的に除外します。

- `レンタル計`
- `総仕入`
- `車両仕入税込`
- `税抜`
- `レンタル税込`
- `#REF!` を含む集計行
- 補足メモ行

## 補足

- GitHub Pages は公開サイトなので、機微データを載せる場合は注意してください。
- サイト公開が嫌なら、Pages を使わず JSON / CSV だけ更新して private repo で見る構成にもできます。

