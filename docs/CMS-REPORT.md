# CMS実装・検証報告

## 1. 現在のサイトの調査

GitHubの `pocketworkshop/meganemaru-blog` を読み取り用にcloneし、mainの最新コミット `a67820a3795255a72a8f1219386af8f2fd0fc401` を取得しました。push・commitは行っていません。
Worker、wrangler.jsonc、public全体、.pages.yml、posts.json、記事・トップ・SKE48関連コード、Analytics挿入を確認しました。
記事は4件、bodyHtml形式。共通のposts.jsonをトップ・一覧・詳細・SKE48記事欄が読み込み、URLは `/blog/article.html?slug=slugまたはID` でした。
D1 binding DBと既存database_idを保持します。リポジトリにD1スキーマ、アーカイブAPI、scheduledハンドラはありません。本番のテーブルやデプロイ済みコードはアクセスできず、確認済みとは扱っていません。

## 2. CMSの構成

`/admin/` のスマホ対応静的UI、`/api/admin/*` の管理API、D1の記事・状態管理、R2画像、Workersの公開JSONと記事HTML生成です。
既存一覧の読み込み先 `/data/posts.json` をWorkerで受け、公開済みD1記事と未移行の既存記事を従来形式で返します。既存一覧の作り直しはありません。

## 3. ChatGPT貼り付け

Tiptap 3.31.4をローカル配信します。ClipboardのHTMLはDOMPurifyで無害化して取り込み、見出し・段落・改行・太字・斜体・リスト・番号・リンク・引用・表を扱います。
HTMLがない場合、明確なMarkdown記号だけを検出してmarkedで変換します。通常テキストは通常の貼り付けとして扱います。
保存・プレビュー・公開表示でサーバーのsanitize-htmlも実行します。許可したタグ・URL・フォント・サイズ・揃えのみ保持します。

## 4. 画像保存

新規R2バケットの指定名 `meganemaru-blog-cms-images`、binding `CMS_IMAGES`。バイナリはR2、メタ情報・記事参照はD1です。
JPEG/PNG/WebP/GIF、10MiBまで。MIMEと先頭シグネチャを照合します。SVG・data URL・iframeは許可しません。
公開画像は公開記事の参照を確認して配信し、下書き画像はAccess保護下に置きます。記事の完全削除でもR2を自動削除しません。

## 5. 認証方式

Cloudflare Accessの同一self-hostedアプリにadminとapi/adminのパスを登録し、本人メールだけをAllowにします。
Worker側でJWTのRS256署名・issuer・AUD・有効期限・必須claims・管理者メールを検証します。実Originも照合し、別ホスト・プレビューURL経由の操作を拒否します。
変更操作はOrigin・専用ヘッダー・Sec-Fetch-Siteを検査し、外部サイトのCSRFを拒否します。SQLはbindパラメータです。
公式のStatic Assets制限からctx.accessに依存しません。実値はCloudflare Secretsに登録し、GitHubに認証秘密は追加しません。

## 6. D1の変更

追加は `cms_posts / cms_keys / cms_meta / cms_media / cms_media_refs` と専用インデックスのみ。
状態はdraft・published・trash。versionと一意のmutation tokenで同時更新を拒否し、参照更新とともにD1 batchで原子的に保存します。
既存テーブルのDROP・ALTER・更新、アーカイブデータの書き換えは含みません。

## 7. 既存記事の扱い

元posts.json、.pages.yml、既存uploadsは変更せず残します。管理画面から1回だけ安全に移行でき、元JSONの控えをD1にも保存します。
4件のタイトル・ID・カテゴリー・日付・概要・本文と、slug/IDの従来URLをローカルで検証しています。
移行後に下書き化・削除しても旧JSONから再表示されません。ゴミ箱の復元は下書きへ戻します。

## 8. 変更・追加ファイル

| 区分 | パス | 目的 |
|---|---|---|
| 変更 | src/index.js | CMSルーティングを先頭に追加。既存SKE48処理本文は変更なし |
| 変更 | wrangler.jsonc | 管理・記事パスのWorker-first、R2 binding追加。DB・Cron値は維持 |
| 変更 | public/app.js | サーバーが作った記事titleを上書きしない |
| 変更 | public/blog/article.js | サーバー描画時の二重描画を避ける |
| 変更 | public/blog/article.css | CMSの画像・引用・フォント・表等の補足 |
| 追加 | src/cms/cms.js | 記事・画像API、移行、プレビュー、公開表示 |
| 追加 | src/cms/security.js | JWT・CSRF・検証・サーバーHTML無害化 |
| 追加 | src/cms/runtime.mjs | ビルド済みWorkerライブラリ |
| 追加 | public/admin/index.html | 記事一覧・編集UI |
| 追加 | public/admin/admin.css | スマホ・PCのレイアウト |
| 追加 | public/admin/admin.js | ビルド済みエディタと操作処理 |
| 追加 | migrations/001_cms.sql | 新規CMS専用テーブル |
| 追加 | README-CMS.md | 導入順序 |
| 追加 | docs/CMS-ACCESS.md | 本人認証設定 |
| 追加 | docs/CMS-R2.md | 画像バケット設定 |
| 追加 | docs/CMS-MIGRATION.md | 移行・Pages CMS廃止・Rollback |
| 追加 | docs/CMS-REPORT.md | この報告 |
| 追加 | docs/CMS-TEST-RESULTS.json | ローカル検証の記録 |
| 追加 | docs/CMS-THIRD-PARTY.txt | 同梱ライブラリのライセンス |
| 追加 | cms/editor.js・runtime-entry.js・package.json・package-lock.json | 再ビルド用ソースと依存の固定 |

必要ファイルのみをZIPに入れ、元のディレクトリ構造を保持します。

## 9. Cloudflareで本人が行う作業

既存D1のテーブル確認と追加SQL実行、R2バケット作成、Accessの本人メール/2パス設定、Worker Secretsの4実値登録、binding・デプロイ確認。
README-CMS.mdのSTEP順で案内します。既存Cron `0 22 * * *` は変更しません。

## 10. GitHubで本人が行う作業

差し替えZIPを展開し、同じ階層へ追加・上書きします。元posts.json・.pages.yml・他ツールは削除しません。
Cloudflareの通常のビルド・デプロイを確認します。今回の納品物のためのコード手編集やビルド済みエディタの再ビルドは不要です。

## 11. 検証済み項目

ローカルのworkerd（1.20261002.1）＋Miniflare＋D1/R2でAPIを動かし、Chromiumで幅390px/1366pxのブラウザ操作を実行しました。認証はテスト鍵で署名したJWTとテスト用JWKSを使い、**本番の認証バイパスはありません**。

- 管理HTML/JS、読取API、変更API、画像アップロード、プレビューの未認証拒否。
- 偽造JWT、本人以外のメール、別ホスト、期限切れ・AUD不一致の拒否。
- Origin/専用ヘッダーによるCSRF拒否、サーバーのXSS除去。
- D1追加SQLが既存の検証用テーブルとレコードを保持。
- 新規記事作成、下書き保存、編集、公開、公開停止、ゴミ箱、復元、完全削除。
- 既存4件の一回移行、再実行の安全性、旧URL、本文等保持。
- 公開一覧JSON、title/description/canonicalのHTML生成、Analytics・X共有の保持。
- 記事の古いversion・同時編集拒否、保存済みslugの保護。
- 端末画像選択、本文途中への画像挿入、代替テキスト・キャプション・サイズ指定。
- 画像のMIME/シグネチャ/容量制限、下書き画像保護、共有画像の保持。
- スマホ幅のHTML/Markdown貼り付け、書式保持、フォント・サイズ・揃え操作。
- 公開ページ用CSSを使うプレビュー、スマホ・PCの横はみ出し確認。
- 編集控えの保存・画面へ復元、エディタのJavaScript実行エラーなし。
- Wrangler 4.146.0のdeploy --dry-run成功（本番へはデプロイせず、DB/R2/ASSETS bindingとバンドルを検証）。
- 実際のStatic Assetsルーターでも管理パス・HTML別名・エンコードされたパスをWorkerで保護。
- 既存SKE48処理本文が取得元と完全一致、DB/Cronの設定値一致。

画面をスクリーンショットでも目視確認しています。単なるUIモックではなく、テスト用のD1・R2に保存した結果です。

## 12. 未検証・制限

- Cloudflare本番の既存D1テーブル一覧・データ、本番デプロイ、実Accessのログイン/メールコード、課金設定。
- 本番のSKE48公式への通信・アーカイブ・Cron。取得元にアーカイブAPI/実行ハンドラがないため、本番との一致は断定できません。
- Android実機のChatGPTアプリが渡すクリップボード内容、IME、画面キーボード、突然のプロセス終了。390pxのタッチ対応ブラウザで操作検証した範囲です。
- 大量記事運用・負荷試験・Workers本番のCPU消費量。V1は個人利用を対象にしています。
- ダウンロードJSONからの自動復旧UI、画像削除UI、予約公開、記事URL変更、任意フォント、マーカーの自動画像化は実装対象外です。

## 公式仕様の調査先

確認日：2026-10-02。非公式な旧ブログ記事だけを根拠にしていません。

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
- https://developers.cloudflare.com/r2/buckets/create-buckets/
- https://tiptap.dev/docs/editor/getting-started/install/vanilla-javascript
- https://tiptap.dev/docs/editor/extensions/functionality/fontfamily
- https://tiptap.dev/docs/editor/extensions/functionality/fontsize
- https://tiptap.dev/docs/editor/extensions/nodes/image
- https://tiptap.dev/docs/editor/extensions/functionality/textalign
- https://quilljs.com/docs/quickstart

Quillの現行公式仕様も比較しました。今回の見出し・フォント・画像キャプション・HTML保存との整合が取りやすいTiptapを採用しました。
