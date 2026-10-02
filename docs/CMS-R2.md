# R2：記事画像の保存設定

## STEP 1　R2を開く

Cloudflare Dashboard → **Storage & databases → R2 object storage**（画面によって R2）を開きます。
初回の場合、R2の利用開始画面が出ます。請求・利用条件が表示されたら本人が確認してください。R2は無料枠を超えると従量課金があります。最新の条件は公式料金ページを確認してください。

## STEP 2　バケットを1個作る

**Create bucket** を押します。
Bucket nameに **`meganemaru-blog-cms-images`** と入力してください。
これは今回、新しく作るバケットの指定名です。既存バケットのIDを推測したものではありません。
ストレージクラスは **Standard**、地域は特別な事情がなければ画面の初期設定を使用し、Create bucketを押します。
既に同名のバケットがある場合は、その中身を確認し、CMS用として使ってよいことを確認してください。

## STEP 3　bindingを確認

差し替えZIPのwrangler.jsoncには以下を追加済みです。コード手編集は不要です。

```json
"r2_buckets": [{ "binding": "CMS_IMAGES", "bucket_name": "meganemaru-blog-cms-images" }]
```

GitHubの更新後にCloudflareのビルド・デプロイが成功すればWorkerにbindingが設定されます。
Workers & Pages → meganemaru-blog → **Bindings** で、R2 bucket **CMS_IMAGES** が上記バケットを指していることを確認します。
Dashboardで直接追加する場合は **Add binding → R2 bucket → Variable name: CMS_IMAGES → 作成したバケットを選択 → Save** です。リポジトリのwrangler.jsoncにも同じ設定が入っているため次回デプロイと一致します。

## STEP 4　公開設定は追加しない

R2のr2.dev公開URL・カスタムドメイン・Public accessは有効にする必要がありません。CORS設定やR2用APIキーも不要です。
Workerのbinding経由で読み書きします。公開記事が参照している画像のみ `/media/cms/ファイル名` から表示します。
下書き画像は本人専用の `/admin/media/cms/ファイル名` で確認できます。

## STEP 5　動作を確認

管理画面 → 新規記事 → 本文の途中をタップ → **＋ 画像** → 端末から選択 → 代替テキスト等入力 → **アップロードして挿入**。
画像が出たら下書き保存・プレビューを試します。公開後はシークレットタブでも画像が表示されます。
JPEG・PNG・WebP・GIF、1ファイル10MiB以内。SVG・HEIC・動画は対象外です。許可MIMEと実データの形式シグネチャを照合します。

## 画像の保護と削除方針

- D1には画像メタ情報と記事からの参照だけを保存します。画像バイナリはR2です。
- 元のposts.jsonにある `/uploads/...` はそのままStatic Assetsから表示します。R2へ強制移動しません。
- ゴミ箱、完全削除、本文から画像を外す操作でもR2オブジェクトは削除しません。共有画像・端末の未送信控えを誤って壊さないためです。
- 別の公開記事が参照していれば一般公開画像URLを維持します。公開記事の参照がなくなれば一般画像URLは404になります。レスポンスはno-storeですが、既に閲覧者が保存したコピーは回収できません。
- V1には画像の完全削除UIを設けません。ストレージの整理はバックアップと参照確認を行ってから別途実施してください。無条件の自動削除・Lifecycleルールは追加しないでください。

公式仕様：
https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
https://developers.cloudflare.com/r2/buckets/create-buckets/
https://developers.cloudflare.com/r2/pricing/
