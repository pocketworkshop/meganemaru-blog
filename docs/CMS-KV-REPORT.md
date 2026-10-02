# R2版 → Workers KV画像版：変更・検証報告

## 変更理由と次の操作

支払い方法を登録せず画像を保存したいという要望に合わせ、画像本体の保存先をR2からWorkers KVへ変更しました。
[CMS-KV.md](CMS-KV.md) に沿って、namespace作成 → KV binding → 実ID入りwrangler.jsonc保存 → GitHubへ差分ファイル上書き → デプロイ確認 → 画像テストの順で進めてください。
**D1のSQLは再実行不要。R2の作成・支払い登録・画像移行は不要です。**

## 構成

- namespace名：**meganemaru-blog-cms-images**
- binding名：**CMS_IMAGES**（種類をR2 bucketからKV namespaceへ変更）
- D1：既存 **meganemaru-blog-db / DB** をそのまま利用。cms_5テーブルとdaily_contentsの削除・再作成・ALTER・追加SQLはなし。
- 記事本文・画像メタ情報・参照はD1、画像バイナリはKV。GitHubは導入ファイル更新だけ。日常の記事投稿・編集・画像アップロードには使わない。
- Access/JWT/CSRF/XSS対策、Tiptap、貼り付け、記事状態管理、移行方式、旧URL、Web Analyticsは維持。
- `/media/cms/UUID.ext` と `/admin/media/cms/UUID.ext` を維持。毎回D1で配信可否を判断してからKV streamを取得。
- ゴミ箱・完全削除でも画像本体は保持。共有画像の自動削除なし。

## 差分ZIPのファイル

| ファイル | 変更内容 |
|---|---|
| src/cms/cms.js | KV put/get、D1からContent-Type、2MiB制限・日本語エラー、sessionのkv設定状態 |
| cms/image-upload.js | 新規。端末内JPEG縮小・圧縮、形式保持、サイズ上限 |
| cms/editor.js | 画像最適化呼び出し、KV表示、画像アップロード時の案内 |
| public/admin/admin.js | 上記ソースから生成済みのブラウザ用コード |
| public/admin/index.html | 画像形式・最適化・2MiB制限の案内 |
| wrangler.jsonc | R2 binding除去、KV binding追加。実IDは設定ツールで入力 |
| README-CMS.md | SQL実行済みを反映、KVの導入順 |
| docs/CMS-KV.md | Android向け設定、無料枠、キャッシュ・画像削除の説明 |
| docs/CMS-KV-SETUP.html | 実IDを貼るだけで設定済みwrangler.jsoncを保存。架空IDなし |
| docs/CMS-MIGRATION.md | バックアップ保存先をKVへ更新。SQL実行済みなら省略を明記 |
| docs/CMS-KV-REPORT.md | 今回の報告 |
| docs/CMS-KV-TEST-RESULTS.json | 今回のローカル検証記録 |

**前回のR2版CMS一式と比較した変更・追加ファイルのみ**です。src/index.js、security.js、runtime.mjs、D1 migration、既存posts.json、公開ブログ表示コード、SKE48コード、ツール、Access手順、CSS、Pages CMSは今回のZIPに含めません。
旧docs/CMS-R2.mdは不要な資料です。使用しないことをREADMEに明記し、コードからは参照しません。前回のCMS-REPORT.md / CMS-TEST-RESULTS.jsonはR2版の歴史的記録として残しています。

## 無料枠・最適化

Cloudflare公式の2026-10-02確認値：保存1GB、読み取り100,000キー/日、書き込み・削除各1,000キー/日、一覧1,000回/日、1 value最大25MiB。同一キー書込は1回/秒。日次枠は日本時間9時にリセット。Workers Freeでは超過時にその種類の操作が失敗します。アカウント内の他のKVと枠を共有します。
今回のCMSは保存上限2MiB。JPEGは長辺1600px以内に端末のCanvasで縮小、品質0.85（必要なら0.78）。小さいJPEGは再圧縮せず、PNG/GIF/WebPは透明部分・動きを保持して無変換。有料画像変換は不要。
新しい画像は必ず新キー。KVの反映・削除は60秒以上遅れる場合があり、即時表示は保証できません。読取cacheTtl=30、HTTP no-storeで、配信認可は毎回D1で確認します。

## 検証済み

2026-10-02、ローカルworkerd 1.20261002.1 / Miniflare / 実際のD1・KV互換binding / Chromiumで実行。R2 binding・バケットはテスト環境にもありません。本番認証を迂回するコードは製品に追加していません。署名済みテストJWTとテストJWKSは検証ハーネス内だけです。

- API・スマホ幅390px・PC幅1366pxの結合確認 **27グループ**：認証、偽造JWT拒否、CSRF、下書き、移行、公開、編集、公開停止、ゴミ箱、復元、完全削除、貼り付け、画像挿入、プレビュー、控え保存・復元。
- JPEG/PNG/WebP/GIFのContent-Type、Content-Disposition、nosniff、配信バイナリ一致、HEAD、MIME偽装とSVG拒否、2MiB超の理由付き拒否。
- KVにバイナリ保存・D1にmime/size保存、一意キー、下書き画像非公開、共有画像保持、公開停止後の配信拒否。
- スマホ幅UIで3200×2400 JPEGを1600×1200へ縮小してKV保存・本文表示。巨大PNGを理由付きで拒否。プレビュー内で2画像の実ロードを確認。
- 別途、画像最適化と設定ツール **2グループ**：小さいJPEG・PNG/GIF/WebPをバイト単位で保持、元ファイル20MiB上限、危険形式拒否、実IDの形式確認、設定ファイル保存、JSONC読込、DB/Cron/Assets/独自設定保持、スマホ幅の横はみ出しなし。
- Native Static Assetsルーターで管理パス8種類を先に認証し、公開JSON・記事HTMLルートも確認。
- Wrangler 4.146.0 `deploy --dry-run` 成功。KV/D1/ASSETSを認識し、R2不要のバンドルを確認。**これは本番デプロイ成功の確認ではありません。** ID未設定設定でもdry-runは可能ですが、本番では設定ツールで実IDを入れたファイルが必須です。
- R2版とのファイル比較：src/index.js・security.js・runtime.mjs・SQL・SKE48・公開ページ・ツール・Analytics関連コードは変更なし。daily_contentsと既存データをテストDBで保持。
- `/uploads/...` はWorkerのCMS処理で横取りしないことをStatic Assetsのテスト用画像で確認。取得済みソースには実public/uploadsディレクトリがないため、本番の個別画像自体は未確認。

## 未検証・制約

- ユーザーの本番Cloudflareでnamespace作成・カード未登録の実アカウント画面・実ID入りデプロイ・Access本人ログイン・本番D1/KVの実データ。
- 実際のKVの地域間伝播遅延・無料枠超過時の実サービス応答。ローカルKVでは地域間遅延を再現しません。
- Android実機での写真選択、巨大写真の端末メモリ、各機種のEXIF回転、ChatGPTアプリの実クリップボード、ローカルHTML設定ツールの開き方。Chromiumのスマホ幅と実際の画像デコード・Canvas処理は確認済み。
- SKE48外部取得先の本番ネットワーク、Cronの実発火、本番の既存uploads画像。今回それらのコードは変更していません。
- 画像の完全削除UIはありません。未使用画像は保持するため容量を使い続けます。記事JSONバックアップには画像本体を含みません。

GitHub commit/push、本番デプロイ、Cloudflare設定変更は実行していません。
