# Workers KV：記事画像の保存設定（Android向け）

2026-10-02にCloudflare公式資料で確認。画像本体のみKVへ変更します。D1・Access・記事URL・画像URLは維持します。
**D1のSQLは実行済みなので再実行不要。R2の有効化・バケット作成・支払い登録は不要です。**

## STEP 1　Cloudflare Dashboardを開く

Chromeで https://dash.cloudflare.com/ を開き、ブログWorkerを置いているアカウントを選びます。
画面が狭い場合、Chrome右上「⋮」→「PC版サイト」をオンにします。
Workers Freeのまま進めます。「Upgrade」「Paidプランに変更」「支払い方法を追加」は押しません。
公式資料ではKVはWorkers Freeに含まれ、KV作成手順に有料契約やカード登録はありません。実際のアカウントの画面は未確認です。支払い登録が出た場合は登録せず戻り、KVの画面か確認してください。

## STEP 2　Workers KVの画面を開く

左上メニュー「☰」→ **Storage & databases（ストレージとデータベース）→ Workers KV** を選択します。
「R2 object storage」ではありません。直接開く場合： https://dash.cloudflare.com/?to=/:account/workers/kv/namespaces

## STEP 3　namespaceを作成

**Create instance（インスタンスを作成）** を押します。表示によって **Create namespace** の場合もあります。

## STEP 4　名前を入力

名前に **meganemaru-blog-cms-images** を入力 → **Create（作成）**。
作成したnamespaceの詳細または一覧にある **Namespace ID** をコピーします。32文字の16進数です。名前・Account ID・D1 Database IDとは別です。
IDはCloudflareが発行した実際の値を使います。配布ファイルに架空のIDは入れていません。

## STEP 5　Workerへbinding

**Workers & Pages → meganemaru-blog → Bindings（バインディング）→ Add binding**。

1. 種類 **KV namespace** を選択 → **Add binding**。
2. **Variable name** に **CMS_IMAGES**。
3. **KV namespace** の選択欄で **meganemaru-blog-cms-images**。
4. **Add binding / Save** で保存。バージョン作成のみなら、**Deployments → 新しいバージョン → Deploy** で本番へ適用します。

同名の古いR2 bindingが実際に残っている場合だけ、種類がR2の **CMS_IMAGES** を外してからKVを追加します。**DB、ASSETS、Secrets、他のbindingは変更しません。**
今回R2バケットは作成していないので、バケット削除作業もありません。

## STEP 6　GitHubへ完成ファイルを上書き

1. **meganemaru-cms-kv-diff.zip** をAndroidで展開します。
2. 同梱の **docs/CMS-KV-SETUP.html** をChrome等で開きます。「Namespace ID」にSTEP 4の実IDを貼り付けます。
3. **設定ファイルを保存** を押し、ID設定済みの **wrangler.jsonc** をダウンロードします。コードの手編集は不要です。現在の設定に独自変更がある場合は、ツールの任意ファイル欄で現在のwrangler.jsoncを選ぶと他の設定を維持します。
4. GitHubの **pocketworkshop/meganemaru-blog** を開き、ZIP内の変更ファイルを同じフォルダ位置へ追加・上書きします。**ルートのwrangler.jsoncだけは、ZIP内のID未設定ファイルではなく、直前に保存したID設定済みファイルを使用**します。
5. ファイル名に端末が「(1)」を付けた場合は **wrangler.jsonc** に戻して上書きします。
6. GitHubのUpload filesが見えない場合、Chromeの「PC版サイト」を使います。ZIP自体をアップロードしても反映されません。自動デプロイが複数回動く場合はwrangler.jsoncを最後にアップロードし、最後のデプロイ成功を確認します。
7. Cloudflare **Workers & Pages → meganemaru-blog → Deployments** で通常のGitHub連携デプロイの成功を確認します。追加のビルドコマンドは不要です。

GitHub連携ではwrangler.jsoncがbindingの設定元です。Dashboardの設定だけに頼ると次回デプロイで消える可能性があるため、実IDを設定ファイルにも保存します。
このIDだけはnamespace作成後に決まります。HTMLツールを端末で開けない場合は、実Namespace IDをこのチャットへ送ればID設定済みファイルを作成できます。パスワード・API token・AccessのJWTは送らないでください。

今回のZIPは前回R2版CMSとの差分です。前回一式をまだGitHubへ追加していない場合は、前回一式を展開し、今回のファイルで上書きしてからまとめて導入してください。旧 **docs/CMS-R2.md** は使用しません。残しても動作には影響しません。

## STEP 7　動作確認

1. ブログの **/admin/** を開き、Accessで本人認証。KV未設定の警告が出ないことを確認。
2. 新規記事 → 本文途中をタップ → **＋画像** → 端末からJPEG写真を選択 → **アップロードして挿入**。
3. **下書き保存 → プレビュー** で画像が表示されることを確認。
4. シークレットタブで `/media/cms/画像キー` を開き、下書き画像は表示されないことを確認。
5. 公開 → ブログ記事で画像を確認。公開停止後は画像URLも一般閲覧不可になります（共有先の公開記事があれば表示可能）。
6. 既存の記事URL・SKE48ページ・ツールを確認。旧 `/uploads/...` はStatic Assetsのままです。

KVは反映に**60秒以上かかる場合**があります。保存成功直後に表示されない場合、1分ほど待って再読み込みしてください。同じ写真を繰り返しアップロードして対処しないでください。

## 無料枠と今回のCMS制限

| 項目 | Workers KV Free（アカウント全体） | 今回のCMS |
|---|---|---|
| 保存容量 | 1GB | 画像のみ。D1の容量とは別 |
| 1 value | 25MiB | 保存画像は **2MiB（約2.1MB）まで** |
| 読み取り | 100,000キー/日 | 画像リクエストでKV読取。HEADも含む |
| 書き込み | 1,000キー/日 | 画像1回のアップロードで1キー書込 |
| 削除 | 1,000キー/日 | V1は画像を自動削除しない |
| 一覧 | 1,000回/日 | CMSの記事一覧はD1。KV一覧は使わない |
| 同じキーへの書込 | 1回/秒 | UUIDで新しいキー。上書きしない |
| KVキャッシュ | 既定60秒、最小30秒 | 読取時cacheTtl=30。HTTPはno-store |

日次枠はUTC 0時＝日本時間9時にリセットされます。Freeで上限を超えると、その種類の操作は失敗します。容量1GBは日次リセットされません。他のWorkerがKVを使えば枠を共有します。Workers自体のリクエスト枠やD1/Accessの制限も別途適用されます。
HTTP no-storeはKV内部キャッシュの無効化ではありません。KVの内部キャッシュから読んでもKV操作の無料枠に数えられます。

## 写真の最適化

- JPEGはブラウザ内のCanvasで、長辺1600pxを目安に縮小しJPEG品質0.85で圧縮。必要な場合のみ0.78でもう一度試します。画像を拡大しません。
- 元のJPEGが長辺1600px以下かつ2MiB以下なら再圧縮しません。
- 選択するJPEGの元ファイルは20MiB・3,200万画素まで。縮小後も2MiBを超えれば理由付きで拒否します。
- PNG・GIF・WebPは透明部分やアニメーションを壊さないため形式もデータも保持し、2MiB超は日本語で縮小を案内します。
- 有料画像変換サービスを使いません。変換したJPEGのEXIF等は引き継ぎません。未変換画像のメタデータ除去は行いません。

## 保存・配信と安全性

D1は記事、mime/size/original_name、記事と画像の参照関係を管理。KVは画像バイナリと補助mime/sizeメタ情報を保存します。KV put/getをWorkerの **env.CMS_IMAGES** から使い、APIキーを公開しません。
公開URL `/media/cms/UUID.ext`、本人専用URL `/admin/media/cms/UUID.ext` は同じです。アップロードごとに新しいUUIDキーを作成し、同名ファイルでも上書きしません。
公開配信は毎回D1で公開記事からの参照を確認し、認可後だけKVを読みます。認可判定をHTTP/CDNに保存しないため、KVにデータが残っていても公開停止後の新たな一般リクエストは拒否します。既に閲覧者が保存した画像は回収できません。
許可MIMEと実データの先頭シグネチャを照合。SVG・HTML・危険形式を拒否し、正しいContent-Type、inline Content-Disposition、nosniffを返します。元ファイル名はキーや配信ヘッダーに使いません。画像変更APIは既存のAccess・CSRF対策を維持します。

## 画像の削除・容量整理

記事のゴミ箱移動・完全削除・画像の差し替えでも、画像本体は削除しません。共有画像と端末の未送信控えを守ります。
容量確認は **Workers KV → namespace → Metrics** 等の画面で行えます。表示名はDashboardの更新で異なる場合があります。
将来の整理は `cms_media` と `cms_media_refs` を照合し、下書き・ゴミ箱を含めて参照がないキーを候補にできます。ただし端末の未送信控えにはサーバーで分からない参照があるため、長い保留期間・バックアップ・本人確認が必要です。V1には完全削除UIを追加していません。
KV deleteは各地域のキャッシュから消えるまで遅延する場合があります。将来の削除も、先にD1の配信許可を外してからKV本体を削除する構成にしてください。今回は手動でキーやテーブルを削除する必要はありません。

## 公式資料（2026-10-02確認）

- [KV料金・無料枠](https://developers.cloudflare.com/kv/platform/pricing/)
- [KV上限](https://developers.cloudflare.com/kv/platform/limits/)
- [Dashboardのnamespace作成・binding手順](https://developers.cloudflare.com/kv/get-started/)
- [Wrangler KV設定](https://developers.cloudflare.com/workers/wrangler/configuration/#kv-namespaces)
- [KVのキャッシュと整合性](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [KV put](https://developers.cloudflare.com/kv/api/write-key-value-pairs/)
- [KV get・cacheTtl](https://developers.cloudflare.com/kv/api/read-key-value-pairs/)
- [KV deleteと反映遅延](https://developers.cloudflare.com/kv/api/delete-key-value-pairs/)
