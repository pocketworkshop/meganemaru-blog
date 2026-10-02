# Cloudflare Access：本人専用の設定

確認日：2026-10-02。設定は本人のCloudflare Dashboardで行います。こちらではアカウントのURL、メール、AUDを推測していません。

## STEP 1　設定に使う実際のURLを確認

Cloudflare → Workers & Pages → **meganemaru-blog** を開きます。
Settings → Domains & Routesで、現在の本番URLを確認してコピーします。
以下の「本番ホスト」は、このURLから `https://` と末尾の `/` を除いた部分です。
ブログ全体を保護する「Protect this Worker / All traffic」は選びません。今回はパス単位で保護します。

## STEP 2　Zero Trustを準備

CloudflareのZero Trust（Cloudflare One）を開きます。初回の場合はチームを作成します。料金プラン・支払い情報を求められる場合は画面の条件を本人が確認して選択してください。
設定画面で実際のTeam domainを確認します。`https://実際のチーム名.cloudflareaccess.com` が後で必要です。
メールに届くワンタイムコードを使いたい場合は、Authentication / Login methods（画面によって Settings → Authentication）で **One-time PIN** を有効にします。既に利用中のログイン方式があればそれでも構いません。

## STEP 3　パスを保護するAccessアプリを作成

Zero Trust → **Access controls → Applications → Create new application**（画面によって Access → Applications → Add an application）を開きます。
**Self-hosted and private** / **Self-hosted** を選択します。
アプリ名は「めがねまる CMS」。セッション時間は例として24時間を選べます。

「Add public hostname」から実際の本番ホストを登録します。workers.devが選択欄にない場合は **Switch to custom input** / カスタム入力で現在のホストを指定します。
**同じアプリ**に、ホストは同じで以下の2つのPathを追加します。

| ホスト | Path |
|---|---|
| 実際の本番ホスト | `admin` |
| 実際の本番ホスト | `api/admin` |

Cloudflareのパス設定は末尾スラッシュなしの親パスを指定すると、そのパスと子パスを対象にできます。URLの入力欄なら `本番ホスト/admin` と `本番ホスト/api/admin` を登録します。`/admin/preview`、`/admin/media/cms/...` もadminの子として保護します。

ポリシーを追加：名前「本人のみ」、Action **Allow**、IncludeのSelector **Emails** に **自分のメールアドレス1件だけ**を入力します。Everyoneやメールドメイン全体を許可しないでください。Bypassも設定しません。
ログイン方法はSTEP 2のOne-time PINなどを選び、アプリを保存します。

> 2つのパスを別アプリにしないでください。この実装は1つのアプリのAUDを使います。1つのアプリに複数のpublic hostname/pathを登録する公式機能を使用します。

## STEP 4　実際のAUDを取得

作成したアプリを開いてOverview / Basic informationにある **Application Audience (AUD) tag** をコピーします。これはApplication IDとは別です。表示される実値を使います。

## STEP 5　Worker側の4設定を登録

Workers & Pages → meganemaru-blog → **Settings → Variables and Secrets → Add** を開きます。
以下はすべて **Secret** として追加すると、Wrangler再デプロイ後も秘密設定として維持できます。値をGitHubやJavaScriptに貼り付ける必要はありません。

| 名前（そのまま入力） | 値 |
|---|---|
| `CMS_SITE_ORIGIN` | 実際の本番URL。`https://`付き、末尾スラッシュなし、パスなし |
| `CMS_ACCESS_TEAM_DOMAIN` | 実際のTeam domain。`https://`付き、末尾スラッシュなし |
| `CMS_ACCESS_AUD` | STEP 4で取得したApplication Audienceタグ |
| `CMS_ADMIN_EMAIL` | Allowに登録した本人のメールアドレス |

Save / Deployで保存します。Cloudflareが再デプロイを求めた場合は実施します。
設定不足ならCMSは503、認証されていなければ401、本人以外は403で停止します。一般ブログはこの認証を必要としません。

## STEP 6　本人と未ログインの確認

1. 通常のブラウザで `/admin/` を開く → Accessで本人認証 → 記事一覧。
2. シークレットタブで `/admin/` を開く → 本人認証が必要。
3. シークレットタブで `/api/admin/posts` を開く → Accessの認証画面または拒否。記事一覧JSONが出てはいけません。
4. 同じシークレットタブで `/` と `/blog/` を開く → 一般公開されている。
5. 管理画面で下書きを保存し、シークレットタブで記事URLを開く → 404。

今後カスタムドメインを使う場合はAccessアプリの保護ホストとCMS_SITE_ORIGINを合わせます。別ホスト、プレビューURL、バージョンURLではWorker側のoriginチェックが管理操作を拒否します。

## 仕組み

Static Assetsの前に管理パスだけWorkerを実行します。Workerは `Cf-Access-Jwt-Assertion` をjoseで検証します。Team domainの公開署名鍵を取得し、RS256署名・issuer・AUD・exp・iat・sub・メールを検査し、CMS_ADMIN_EMAILとの一致で認可します。Static Assetsではctx.accessが渡らないという公式の制限があるため、ctx.accessには依存しません。
変更APIは同一Originと専用ヘッダーを要求し、外部サイトからの変更を拒否します。CORSで他サイトを許可しません。

## 公式資料

- WorkersのAccess（workers.dev・パス単位・Static Assets制限）：https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- パスのマッチ規則：https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- JWT検証：https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- self-hostedアプリ作成：https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- Static AssetsのWorker-first：https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
