# めがねまるのブログ STEP 2

STEP 1のトップページに、記事一覧・記事詳細・カテゴリー絞り込み・検索を追加した版です。

## STEP 2で追加したもの
- `public/data/posts.json` : 記事データ
- `public/blog/index.html` : 記事一覧
- `public/blog/blog.js` : 一覧・検索・カテゴリー絞り込み
- `public/blog/article.html` : 記事詳細
- `public/blog/article.js` : 記事表示
- トップページの「最新記事」を `posts.json` から自動表示

## 記事の仕組み
記事は今のところ `public/data/posts.json` に保存します。STEP 3では Pages CMS の管理画面からこのデータを簡単に更新できるようにします。

## まだ未実装
- Pages CMSからの記事投稿
- D1
- SKE48自動取得
- Cron Trigger
- Workers AI
- 握手券管理の実処理

サイト名やキャッチコピーは `public/config.js` で変更できます。


## アクセス解析
Cloudflare Web Analytics をトップページ・記事一覧・記事詳細ページに組み込み済みです。

