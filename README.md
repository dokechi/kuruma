# kuruma 完全版バンドル

この一式は **GitHub Pages の root 構成** 前提です。  
リポジトリ直下に `index.html` が来る形で使います。

## まずやること

1. いまのリポジトリ内ファイルを全部消す
2. このZIPを解凍する
3. **解凍して出てきた親フォルダではなく、その中身だけ** を GitHub にアップロードする
4. リポジトリ直下が次の形になっていることを確認する

```text
index.html
app.js
styles.css
.nojekyll
data/
.github/
scripts/
requirements.txt
README.md
00_START_HERE.txt
```

## Pages 設定

- Settings → Pages
- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/(root)`

## まず表示確認だけしたい場合

最低限、次が入っていれば表示できます。

- `index.html`
- `app.js`
- `styles.css`
- `data/`
- `.nojekyll`

## スプシ連動を有効化する場合

### 1. GitHub Secrets
`Settings → Secrets and variables → Actions`

- `GOOGLE_SERVICE_ACCOUNT_JSON`

### 2. Google 側
- サービスアカウントを作る
- Sheets API を有効化
- JSON鍵を発行
- そのサービスアカウントを対象スプシに共有

### 3. workflow 実行
Actions タブから `Sync Google Sheet to JSON` を手動実行

## 対象スプシ

- spreadsheetId: `1qJHYJ4rE8R-nnZPuXSkzP-kYHuZVO8_8`
- gid: `699666833`

## メモ

- 最初は `data/*.json` の同梱サンプルで表示されます
- 連動後は workflow が `data/*.json` を上書きします
- サンプルJSONはアップロード済み台帳の列構成を元に作っています
