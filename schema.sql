-- KComment · Cloudflare D1 建表脚本
-- 用法：wrangler d1 execute kcomment --file=./schema.sql [--remote]
-- 与自托管版 src/db.js 中的建表语句保持一致。

CREATE TABLE IF NOT EXISTS comments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key       TEXT    NOT NULL,             -- 所属页面（文章/帖子），即评论挂载点
  parent_id      INTEGER NULL,                 -- 回复的评论 id，一级评论为 NULL
  user_name      TEXT    NOT NULL,             -- 公开昵称（匿名时为空）
  user_email_hash TEXT   NULL,                 -- 邮箱哈希，仅用于生成头像，绝不存明文
  avatar_seed    TEXT    NULL,                 -- 头像种子（邮箱加盐哈希，不可反推）
  is_anonymous   INTEGER NOT NULL DEFAULT 0,   -- 是否匿名（对外只下发脱敏昵称）
  is_author      INTEGER NOT NULL DEFAULT 0,   -- 是否站长回复（预留）
  content        TEXT    NOT NULL,             -- 评论正文（已转义 + 敏感词过滤）
  ip             TEXT    NULL,                 -- 仅治理用，任何对外接口不下发
  ua             TEXT    NULL,                 -- 仅治理用，任何对外接口不下发
  status         TEXT    NOT NULL DEFAULT 'approved', -- approved | pending | rejected
  likes          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS like_marks (
  comment_id INTEGER NOT NULL,
  token      TEXT    NOT NULL,                 -- 访客指纹（IP+UA 哈希），点赞去重
  created_at TEXT    NOT NULL,
  PRIMARY KEY (comment_id, token)
);

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  reason     TEXT    NULL,
  ip         TEXT    NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page_key, status, id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_comment ON reports (comment_id);
