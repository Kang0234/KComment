'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

// ---- 保证数据目录存在 ----
if (!config.dbPath) throw new Error('dbPath 未配置');
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

// ---- 建表 ----
db.exec(`
CREATE TABLE IF NOT EXISTS comments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key       TEXT    NOT NULL,             -- 所属页面（文章/帖子），即评论挂载点
  parent_id      INTEGER NULL,                 -- 回复的评论 id，一级评论为 NULL
  user_name      TEXT    NOT NULL,             -- 公开昵称
  user_email_hash TEXT   NULL,                 -- 邮箱的 md5 哈希，仅用于生成头像，绝不存明文
  is_anonymous   INTEGER NOT NULL DEFAULT 0,   -- 是否匿名（界面隐藏昵称）
  content        TEXT    NOT NULL,             -- 评论正文（已做消毒与敏感词过滤）
  ip             TEXT    NULL,                 -- 评论者 IP，仅管理员可见，用于治理
  ua             TEXT    NULL,                 -- User-Agent，仅管理员可见
  status         TEXT    NOT NULL DEFAULT 'approved', -- approved | pending | rejected
  likes          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS like_marks (
  comment_id INTEGER NOT NULL,
  token      TEXT    NOT NULL,
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

CREATE TABLE IF NOT EXISTS violation_patterns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern    TEXT NOT NULL,
  note       TEXT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_violation_patterns_id ON violation_patterns (id DESC);

CREATE TABLE IF NOT EXISTS violations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id   INTEGER NULL,
  matched_id   INTEGER NULL,
  matched_text TEXT NULL,
  ip           TEXT NULL,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- 多管理员 / 登录限流 / IP 封禁（与 Cloudflare 版一致）
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  note          TEXT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_fails (
  ip          TEXT PRIMARY KEY,
  hour_ts     INTEGER NOT NULL,
  hour_count  INTEGER NOT NULL DEFAULT 0,
  consecutive INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ip_bans (
  ip        TEXT PRIMARY KEY,
  reason    TEXT NULL,
  banned_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page_key, status, id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_comment ON reports (comment_id);
`);

module.exports = db;