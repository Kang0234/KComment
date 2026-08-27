'use strict';

// 集中管理环境变量，其他模块统一从这里读，避免散落 process.env
require('dotenv').config();
const path = require('path');

function bool(v, def) {
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1';
}

const config = {
  port: Number(process.env.PORT || 3000),
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123',
  jwtSecret: process.env.JWT_SECRET || 'please-change-me-to-a-long-random-string',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'comments.db'),
  seedDemo: bool(process.env.SEED_DEMO, true),
};

module.exports = config;