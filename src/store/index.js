'use strict';

// ---------- 存储后端选择 ----------
// DB_TYPE=mongo（Vercel 等无文件系统场景）→ MongoDB
// 其余/缺省                    → SQLite（本地文件 data/comments.db）

const config = require('../config');

module.exports = process.env.DB_TYPE === 'mongo'
  ? require('./mongo')
  : require('./sqlite');
