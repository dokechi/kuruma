# kuruma 修正版バンドル

この ZIP は **そのまま GitHub Pages に置ける修正版** です。

## 壊れていた原因

元の ZIP では次の 3 ファイルが実ファイルではなく、`git apply` 用の差分テキストになっていました。

- `index.html`
- `app.js`
- `styles.css`

この修正版では 3 ファイルを作り直し、`data/*.json` から表示できる状態に戻しています。

## 使い方

1. リポジトリの中身をいったん退避または削除
2. この ZIP を解凍
3. **親フォルダではなく中身だけ** をリポジトリ直下へアップロード
4. GitHub Pages を `main` / `/(root)` に設定
5. 表示確認

## 含まれているもの

- `index.html`
- `app.js`
- `styles.css`
- `.nojekyll`
- `data/`
- `.github/workflows/sync-gsheet.yml`
- `scripts/sync_from_gsheet.py`
- `requirements.txt`

## Google スプレッドシート同期

GitHub Secrets に `GOOGLE_SERVICE_ACCOUNT_JSON` を入れれば、Actions から `data/*.json` を更新できます。
