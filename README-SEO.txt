# めがねまるのブログ SEO差し替え用

GitHub `pocketworkshop/meganemaru-blog` の 2026-10-04 時点の `main` から確認した対象ファイルを元にした、変更ファイルのみの差し替えZIPです。

変更:
- `src/worker.js`: `/robots.txt` と `/sitemap.xml` を動的生成。公開中のCMS記事を自動でサイトマップへ反映。
- `wrangler.jsonc`: 上記2URLを Worker first の対象に追加。
- `public/index.html`: canonical を追加。
- `public/blog/index.html`: canonical を追加し、カテゴリ絞り込みURLの重複評価を抑制。

GitHubへのコミットは行っていません。
