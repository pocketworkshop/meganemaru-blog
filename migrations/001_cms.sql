-- CMS専用テーブルの追加だけを行います。既存テーブルは変更しません。
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS cms_posts (
 id TEXT PRIMARY KEY,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 category TEXT NOT NULL,
 date TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '',
 theme TEXT NOT NULL DEFAULT '',
 body_html TEXT NOT NULL DEFAULT '',
 extra_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','trash')),
 previous_status TEXT NOT NULL DEFAULT 'draft',
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 mutation_token TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cms_posts_status_date ON cms_posts(status,date);
-- 完全削除後も既存posts.jsonの記事が再出現しないようキーを保持します。
CREATE TABLE IF NOT EXISTS cms_keys (
 key TEXT PRIMARY KEY,
 post_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cms_media (
 key TEXT PRIMARY KEY,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 original_name TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_media_refs (
 post_id TEXT NOT NULL REFERENCES cms_posts(id) ON DELETE CASCADE,
 media_key TEXT NOT NULL REFERENCES cms_media(key),
 PRIMARY KEY(post_id,media_key)
);
CREATE INDEX IF NOT EXISTS cms_media_refs_key ON cms_media_refs(media_key);
