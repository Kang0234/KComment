'use strict';

const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const { signAdmin, requireAdmin, clientIp } = require('../middleware/auth');
const { loginLimiter, adminLimiter } = require('../middleware/ratelimit');
const { toPublic } = require('../services/privacy');

const router = Router();

// ---- 管理员登录 ----
router.post('/login', loginLimiter, (req, res) => {
  const password = String((req.body || {}).password || '');
  if (password !== config.adminPassword) {
    return res.status(401).json({ code: 401, msg: '密码错误' });
  }
  res.json({ code: 0, data: { token: signAdmin({ role: 'admin' }), expire: '24h' } });
});

// 以下接口均需管理员凭证
router.use(requireAdmin, adminLimiter);

// 判断某一状态是否合法
const STATUS_SET = new Set(['approved', 'pending', 'rejected']);

// ---- 评论列表（含治理字段 + 举报数）----
router.get('/comments', (req, res) => {
  const status = String(req.query.status || '');
  const page = Math.max(1, Number(req.query.page || 1));
  const size = Math.min(50, Math.max(1, Number(req.query.size || 20)));
  const validStatus = STATUS_SET.has(status) ? status : null;

  let listSql = `SELECT c.*,
      (SELECT COUNT(*) FROM reports r WHERE r.comment_id = c.id) AS report_count
    FROM comments c`;
  const where = [];
  const params = [];
  if (validStatus) {
    where.push('c.status = ?');
    params.push(validStatus);
  }
  if (where.length) listSql += ' WHERE ' + where.join(' AND ');
  listSql += ' ORDER BY c.id DESC LIMIT ? OFFSET ?';
  params.push(size, (page - 1) * size);

  const rows = db.prepare(listSql).all(...params);
  let totalSql = 'SELECT COUNT(*) AS n FROM comments c';
  const totalParams = [];
  if (validStatus) { totalSql += ' WHERE c.status = ?'; totalParams.push(validStatus); }
  const total = db.prepare(totalSql).get(...totalParams).n;

  res.json({
    code: 0,
    data: {
      list: rows.map((r) => toPublic(r, { forAdmin: true })),
      total,
      page,
      size,
    },
  });
});

// ---- 待审数量心跳（供主站 badge 使用）----
router.get('/heartbeat', (req, res) => {
  const pending = db.prepare('SELECT COUNT(*) AS n FROM comments WHERE status=\'pending\'').get().n;
  const reports = db.prepare('SELECT COUNT(DISTINCT comment_id) AS n FROM reports').get().n;
  res.json({ code: 0, data: { pending, reported: reports } });
});

// ---- 审核（批准 / 驳回）----
router.patch('/comments/:id/review', (req, res) => {
  const id = Number(req.params.id);
  const status = String((req.body || {}).status || '');
  if (!STATUS_SET.has(status)) return res.status(400).json({ code: 400, msg: '无效状态' });

  const info = db.prepare('UPDATE comments SET status=? WHERE id=?').run(status, id);
  if (info.changes === 0) return res.status(404).json({ code: 404, msg: '评论不存在' });
  res.json({ code: 0, data: { id, status } });
});

// ---- 删除评论（级联删除其回复）----
router.delete('/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').run(id, id);
  db.prepare('DELETE FROM reports WHERE comment_id = ?').run(id);
  res.json({ code: 0, msg: '已删除' });
});

// ---- 举报列表 ----
router.get('/reports', (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.reason, r.ip, r.created_at,
           c.id AS comment_id, c.content, c.user_name, c.status
    FROM reports r JOIN comments c ON c.id = r.comment_id
    ORDER BY r.id DESC LIMIT 100
  `).all();
  res.json({ code: 0, data: rows });
});

module.exports = router;