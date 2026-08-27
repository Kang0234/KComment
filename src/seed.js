'use strict';

// 演示数据脚本：npm run seed 或服务首次启动时写入（仅在评论表为空时）
const store = require('./store');
const { emailHash } = require('./services/privacy');
const { filter: sensitive, escapeHtml } = require('./services/sensitive');

async function seed() {
  const now = Date.now();
  function t(secondsAgo) {
    return new Date(now - secondsAgo * 1000).toISOString();
  }

  const rows = [
    { page_key: '/demo', parent_id: null, user_name: '程序员小王', user_email_hash: emailHash('wang@example.com'), is_anonymous: 0, content: sensitive.filter(escapeHtml('这个隐私评论系统真不错，邮箱只存哈希，点赞也不会被刷，赞一个！')), ip: '127.0.0.1', ua: 'Mozilla/5.0 (demo)', status: 'approved', created_at: t(3600 * 5) },
    { page_key: '/demo', parent_id: null, user_name: '林间晚风', user_email_hash: emailHash('wanfeng@example.com'), is_anonymous: 1, content: sensitive.filter(escapeHtml('匿名发言体验很好，界面也不用担心真实昵称泄露。')), ip: '10.0.0.1', ua: 'Mozilla/5.0 (demo)', status: 'approved', created_at: t(3600 * 4) },
    { page_key: '/demo', parent_id: null, user_name: '张大山', user_email_hash: emailHash('zhang@example.com'), is_anonymous: 0, content: sensitive.filter(escapeHtml('安全治理做得很扎实，敏感词自动过滤，管理员后台还能一键审核。')), ip: '100.64.0.1', ua: 'curl/8.0', status: 'approved', created_at: t(3600 * 2) },
  ];

  await store.demoInserts(rows);

  // 加一条回复
  const list = await store.listApproved('/demo');
  if (list.length) {
    await store.insertComment({
      page_key: '/demo',
      parent_id: list[0].id,
      user_name: '阿sir',
      user_email_hash: emailHash('asir@example.com'),
      is_anonymous: false,
      content: sensitive.filter(escapeHtml('回复：同感！IP 只在后台给管理员看，前端完全不暴露，这才是真隐私。')),
      ip: '192.168.0.5',
      ua: 'Mozilla/5.0 (demo)',
      status: 'approved',
      created_at: t(3600),
    });
  }
  console.log('演示数据写入完成');
}

module.exports = seed;

// 命令行直接运行 npm run seed 时生效
if (require.main === module) {
  require('dotenv').config();
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
