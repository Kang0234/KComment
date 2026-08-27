'use strict';

const express = require('express');
const path = require('path');
const config = require('./src/config');
const db = require('./src/db');
const commentsRouter = require('./src/routes/comments');
const adminRouter = require('./src/routes/admin');

const app = express();

// 解析 JSON 体，并限制体积防滥用
app.use(express.json({ limit: '64kb' }));

// 统一错误兜底
app.use((req, res, next) => next());
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, msg: '请求体过大' });
  }
  console.error(err);
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
});

// 业务路由
app.use('/api/comment', commentsRouter);
app.use('/api/admin', adminRouter);

// 静态资源：前端评论模块（widget）
app.use('/widget', express.static(path.join(__dirname, 'public', 'widget')));

// 演示页
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 首次启动且表为空时，自动写入演示数据（便于开箱即看效果）
if (config.seedDemo) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
  if (count === 0) {
    require('./src/seed');
  }
}

app.listen(config.port, () => {
  console.log(`Priva Comment 已启动: http://localhost:${config.port}`);
  console.log(`  演示页      : http://localhost:${config.port}/`);
  console.log(`  前端模块   : http://localhost:${config.port}/widget/comment-widget.js`);
});

module.exports = app;