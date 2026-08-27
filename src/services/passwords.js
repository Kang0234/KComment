'use strict';

// ---------- 密码安全存储与校验 ----------
// 管理员密码用 scrypt(带随机盐) 哈希后存 settings 表，不再明文留存。
// 登录校验使用 timingSafeEqual 防时序侧信道。

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split(':');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(String(password), salt, 64);
    const expect = Buffer.from(hash, 'hex');
    return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
  } catch {
    return false;
  }
}

// 常数时间比较任意字符串（用于环境变量密码兜底比对）
function safeEqual(a, b) {
  const ba = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { hashPassword, verifyPassword, safeEqual };
