'use strict';

// 演示数据脚本：npm run seed 或服务首次启动时由 seed.js 写入（仅在表为空时）
const db = require('./db');
const config = require('./config');
const { emailHash } = require('./services/privacy');
const { filter: sensitive, escapeHtml } = require('./services/sensitive');

const now = Date.now();
function t(secondsAgo) {
  return new Date(now - secondsAgo * 1000).toISOString();
}

// 用 mysql 风格的多行插入，简洁起见分条插入
const rows = [
  // 一级评论
  { page_key: '/demo', parent_id: null, user_name: '程序员小王', email: 'wang@example.com', anon: 0, content: '这个隐私评论系统真不错，邮箱只存哈希，点赞也不会被刷，赞一个！', ip: '127.0.0.1', ua: 'Mozilla/5.0 (demo)', created_at: t(3600 * 5) },
  { page_key: '/demo', parent_id: null, user_name: '林间晚风', email: 'wanfeng@example.com', anon: 1, content: '匿名发言体验很好，界面也不用担心真实昵称泄露。', ip: '10.0.0.1', ua: 'Mozilla/5.0 (demo)', created_at: t(3600 * 4) },
  { page_key: '/demo', parent_id: null, user_name: '张大山', email: 'zhang@example.com', anon: 0, content: '安全治理做得很扎实，敏感词自动过滤，管理员后台还能一键审核。', ip: '100.64.0.1', ua: 'curl/8.0', created_at: t(3600 * 2) },
];

const insert = db.prepare(
  `INSERT INTO comments (page_key, parent_id, user_name, user_email_hash, is_anonymous, content, ip, ua, status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`
);

for (const r of rows) {
  insert.run(
    r.page_key, r.parent_id, r.user_name, emailHash(r.email), r.anon ? 1 : 0,
    sensitive.filter(escapeHtml(r.content)), r.ip, r.ua, r.created_at
  );
}

// 加一条回复
const replySchema = db.prepare(`SELECT id FROM comments WHERE page_key='/demo' LIMIT 1`);
const first = replySchema.get();
if (first) {
  db.prepare(
    `INSERT INTO comments (page_key, parent_id, user_name, user_email_hash, is_anonymous, content, ip, ua, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`
  ).run('/demo', first.id, '阿sir', emailHash('asir@example.com'), 0,
    '回复：同感！IP 只在后台给管理员看，前端完全不暴露，这才是真隐私。',
    '192.168.0.5', 'Mozilla/5.0 (demo)', t(3600));
}

console.log('演示数据写入完成');
module.exports = rows;