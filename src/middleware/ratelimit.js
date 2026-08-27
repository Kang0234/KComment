'use strict';

const rateLimit = require('express-rate-limit');

// 评论/点赞/举报接口：单 IP 频率限制，防止刷屏与滥用
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: '操作过于频繁，请稍后再试' },
});

// 管理登录：更严格的频率限制，防止暴力破解
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: '尝试过于频繁，请稍后再试' },
});

// 管理接口：防止被外部爬取
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, msg: '请求过快' },
});

module.exports = { writeLimiter, loginLimiter, adminLimiter };