'use strict';

// ---------- SQLite 存储后端（本地/自托管默认）----------
// 所有数据访问经由这一层，路由代码不再直接写 SQL，
// 便于切换到 MongoDB（Vercel）等其他后端。

const fs = require('fs');
const path = require('path');
const config = require('../config');

if (!config.dbPath) throw new Error('dbPath 未配置');
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  throw new Error('better-sqlite3 未安装。若使用 MongoDB 后端，请设置 DB_TYPE=mongo');
}

const conn = new Database(config.dbPath);
conn.pragma('journal_mode = WAL');

conn.exec(`
CREATE TABLE IF NOT EXISTS comments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key       TEXT    NOT NULL,
  parent_id      INTEGER NULL,
  user_name      TEXT    NOT NULL,
  user_email_hash TEXT   NULL,
  is_anonymous   INTEGER NOT NULL DEFAULT 0,
  content        TEXT    NOT NULL,
  ip             TEXT    NULL,
  ua             TEXT    NULL,
  status         TEXT    NOT NULL DEFAULT 'approved',
  ai_reason      TEXT    NULL,
  likes          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL
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
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page_key, status, id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_reports_comment ON reports (comment_id);
`);

function commentCount() {
  return conn.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
}

function listApproved(pageKey) {
  return conn.prepare("SELECT * FROM comments WHERE page_key=? AND status='approved' ORDER BY id ASC").all(pageKey);
}

function insertComment(c) {
  const info = conn.prepare(
    `INSERT INTO comments
      (page_key, parent_id, user_name, user_email_hash, is_anonymous, content, ip, ua, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(c.page_key, c.parent_id, c.user_name, c.user_email_hash, c.is_anonymous, c.content, c.ip, c.ua, c.status, c.created_at);
  return Number(info.lastInsertRowid);
}

function getComment(id) {
  return conn.prepare('SELECT * FROM comments WHERE id=?').get(id);
}

function setStatus(id, status) {
  return conn.prepare('UPDATE comments SET status=? WHERE id=?').run(status, id).changes > 0;
}

// 级联删除评论与其回复，并清理举报记录
function deleteCascade(id) {
  conn.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').run(id, id);
  conn.prepare('DELETE FROM reports WHERE comment_id = ?').run(id);
}

function likeState(commentId, token) {
  const existing = conn.prepare('SELECT comment_id FROM like_marks WHERE comment_id=? AND token=?').get(commentId, token);
  const row = conn.prepare('SELECT likes FROM comments WHERE id=?').get(commentId);
  return { liked: !!existing, likes: row ? row.likes : 0 };
}
function likeAdd(commentId, token, now) {
  conn.prepare('INSERT OR IGNORE INTO like_marks (comment_id, token, created_at) VALUES (?, ?, ?)').run(commentId, token, now);
  conn.prepare('UPDATE comments SET likes = likes + 1 WHERE id=?').run(commentId);
}
function likeRemove(commentId, token) {
  conn.prepare('DELETE FROM like_marks WHERE comment_id=? AND token=?').run(commentId, token);
  conn.prepare('UPDATE comments SET likes = MAX(0, likes - 1) WHERE id=?').run(commentId);
}

function insertReport(commentId, reason, ip, now) {
  conn.prepare('INSERT INTO reports (comment_id, reason, ip, created_at) VALUES (?, ?, ?, ?)').run(commentId, reason, ip, now);
}

function adminList({ status, limit, offset }) {
  let sql = `SELECT c.*,
      (SELECT COUNT(*) FROM reports r WHERE r.comment_id = c.id) AS report_count
    FROM comments c`;
  const params = [];
  if (status) { sql += ' WHERE c.status = ?'; params.push(status); }
  sql += ' ORDER BY c.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = conn.prepare(sql).all(...params);
  let cntSql = 'SELECT COUNT(*) AS n FROM comments';
  const cntParams = [];
  if (status) { cntSql += ' WHERE c.status = ?'; cntParams.push(status); }
  const total = conn.prepare(cntSql).get(...cntParams).n;
  return { rows, total };
}

function counts() {
  return {
    pending: conn.prepare("SELECT COUNT(*) AS n FROM comments WHERE status='pending'").get().n,
    reported: conn.prepare('SELECT COUNT(DISTINCT comment_id) AS n FROM reports').get().n,
  };
}

function reportsLatest(limit) {
  return conn.prepare(`
    SELECT r.id, r.reason, r.ip, r.created_at,
           c.id AS comment_id, c.content, c.user_name, c.status
    FROM reports r JOIN comments c ON c.id = r.comment_id
    ORDER BY r.id DESC LIMIT ?
  `).all(limit);
}

function demoInserts(rows) {
  const ins = conn.prepare(
    `INSERT INTO comments (page_key, parent_id, user_name, user_email_hash, is_anonymous, content, ip, ua, status, created_at)
     VALUES (@page_key, @parent_id, @user_name, @user_email_hash, @is_anonymous, @content, @ip, @ua, @status, @created_at)`
  );
  const tx = conn.transaction((all) => all.forEach((r) => ins.run(r)));
  tx(rows);
}

// ---- settings（键值表）----
function settingGet(key) {
  const row = conn.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : null;
}
function settingSet(key, value) {
  conn.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, String(value));
}

module.exports = {
  kind: 'sqlite',
  commentCount, listApproved, insertComment, getComment, setStatus, deleteCascade,
  likeState, likeAdd, likeRemove, insertReport, adminList, counts, reportsLatest, demoInserts,
  settingGet, settingSet,
};
