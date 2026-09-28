# めがねまるのブログ STEP 1

トップページのデザインを実装した静的サイトです。

## ファイル
- `public/index.html` : トップページ
- `public/styles.css` : PC / スマホ対応デザイン
- `public/app.js` : スマホメニューなど
- `public/config.js` : サイト名・キャッチコピーの設定
- `public/assets/mascot.png` : マスコット画像

## サイト名の変更
`public/config.js` の次の1行だけ変えればOKです。

```js
siteName: 'めがねまるのブログ',
```

## ローカル確認
`public` フォルダで簡易Webサーバーを起動すると確認できます。

```bash
python -m http.server 8000
```

その後 `http://localhost:8000` を開きます。

## 今回はまだ未実装
- CMSからの記事投稿
- D1
- SKE48自動取得
- Cron Trigger
- Workers AI
- 握手券管理の実処理

STEP 1では「見た目とレスポンシブ対応」だけ完成させています。
