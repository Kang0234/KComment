'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

// 管理员签发 token（24 小时有效）
function signAdmin(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });
}

// 校验管理请求：需在请求头携带 Authorization: Bearer <token>
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ code: 401, msg: '未登录或凭证缺失' });
  }
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, msg: '凭证无效或已过期' });
  }
}

// 统一取客户端 IP（兼容反向代理传递的 X-Forwarded-For）
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

module.exports = { signAdmin, requireAdmin, clientIp };