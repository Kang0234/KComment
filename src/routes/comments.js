'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const { emailHash, toPublic } = require('../services/privacy');
const { filter: sensitive, escapeHtml } = require('../services/sensitive');
const { clientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/ratelimit');

const router = Router();

// 校验正文基础规则：若非空、长度、是否纯空白
function validateContent(content) {
  if (typeof content !== 'string') return '评论内容格式错误';
  const len = [...content].length;
  if (len < 1) return '评论内容不能为空';
  if (len > 1000) return '评论内容过长（最多 1000 字）';
  if (!content.trim()) return '评论内容不能为空';
  return null;
}

function validateName(name) {
  if (typeof name !== 'string') return '昵称格式错误';
  const len = [...name].length;
  if (len < 1 || len > 24) return '昵称长度需在 1-24 字之间';
  if (/<|>|&|['"]/.test(name)) return '昵称不能包含特殊字符';
  return null;
}

// 为点赞生成一个匿名 token，固化在客户端 cookie/本地存储，防止刷赞
function clientToken(req) {
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

// ---- 发表评论 / 回复 ----
router.post('/', writeLimiter, (req, res) => {
  const body = req.body || {};
  const pageKey = String(body.page_key || '').trim().slice(0, 128);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const isAnon = !!body.is_anonymous;

  if (!pageKey) return res.status(400).json({ code: 400, msg: '缺少 page_key' });

  // 回复场景：parent_id 必须真实存在
  let parentId = null;
  if (body.parent_id != null && body.parent_id !== 0 && body.parent_id !== '') {
    parentId = Number(body.parent_id);
    const parent = db.prepare('SELECT id FROM comments WHERE id=?').get(parentId);
    if (!parent) return res.status(404).json({ code: 404, msg: '被回复的评论不存在' });
  }

  const nameErr = validateName(body.user_name);
  if (nameErr) return res.status(400).json({ code: 400, msg: nameErr });

  const contentErr = validateContent(content);
  if (contentErr) return res.status(400).json({ code: 400, msg: contentErr });

  // 安全：先转义，再过敏感词过滤（双重防护）
  const safeContent = sensitive.filter(escapeHtml(content));

  const info = db.prepare(
    `INSERT INTO comments
      (page_key, parent_id, user_name, user_email_hash, is_anonymous, content, ip, ua, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`
  ).run(
    pageKey,
    parentId,
    String(body.user_name).slice(0, 24),
    emailHash(body.user_email),
    isAnon ? 1 : 0,
    safeContent,
    clientIp(req),
    String(req.headers['user-agent'] || '').slice(0, 200),
    new Date().toISOString()
  );

  const row = db.prepare('SELECT * FROM comments WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({ code: 0, data: toPublic(row) });
});

// ---- 点赞 / 取消点赞 ----
router.post('/:id/like', writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT id, status FROM comments WHERE id=?').get(id);
  if (!comment) return res.status(404).json({ code: 404, msg: '评论不存在' });
  if (comment.status !== 'approved') return res.status(404).json({ code: 404, msg: '评论不存在' });

  const token = clientToken(req);
  const existing = db.prepare('SELECT comment_id FROM like_marks WHERE comment_id=? AND token=?').get(id, token);

  if (existing) {
    // 已点赞 → 取消
    db.prepare('DELETE FROM like_marks WHERE comment_id=? AND token=?').run(id, token);
    db.prepare('UPDATE comments SET likes = MAX(0, likes - 1) WHERE id=?').run(id);
  } else {
    db.prepare('INSERT OR IGNORE INTO like_marks (comment_id, token, created_at) VALUES (?, ?, ?)').run(
      id, token, new Date().toISOString()
    );
    db.prepare('UPDATE comments SET likes = likes + 1 WHERE id=?').run(id);
  }

  const row = db.prepare('SELECT likes FROM comments WHERE id=?').get(id);
  const liked = !existing;
  res.json({ code: 0, data: { likes: row.likes, liked } });
});

// ---- 举报 ----
router.post('/:id/report', writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT id FROM comments WHERE id=?').get(id);
  if (!comment) return res.status(404).json({ code: 404, msg: '评论不存在' });

  const reason = String((req.body || {}).reason || '').slice(0, 200);
  db.prepare('INSERT INTO reports (comment_id, reason, ip, created_at) VALUES (?, ?, ?, ?)').run(
    id, reason, clientIp(req), new Date().toISOString()
  );
  res.json({ code: 0, msg: '举报成功，我们会尽快处理' });
});

// ---- 查询某页面的评论（树形结构）----
router.get('/', (req, res) => {
  const pageKey = String(req.query.page_key || '').trim();
  if (!pageKey) return res.status(400).json({ code: 400, msg: '缺少 page_key' });

  const rows = db.prepare('SELECT * FROM comments WHERE page_key=? AND status=\'approved\' ORDER BY id ASC').all(pageKey);

  // 轻量脱敏后再构建树，对外绝不下发 ip/ua
  const nodes = new Map();
  rows.forEach((r) => nodes.set(r.id, { comment: toPublic(r), replies: [] }));

  const roots = [];
  nodes.forEach((node) => {
    const pid = node.comment.parent_id;
    if (pid && nodes.has(pid)) {
      nodes.get(pid).replies.push(node);
    } else {
      roots.push(node);
    }
  });

  res.json({ code: 0, data: { count: rows.length, roots } });
});

module.exports = router;