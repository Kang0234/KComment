'use strict';

// ---------- 登录安全闸门（IP 限流 / 连败锁定，阈值可在后台设置调整） ----------
// login_rate_max       —— 每 IP 每小时最多失败次数（默认 5）
// login_lock_threshold —— 连续失败达到该次数直接 403 锁 IP（默认 30）

const db = require('../db');
const settings = require('./settings');

const HOUR_MS = 3600_000;

// 返回 { ok:true, hourTs, maxFail } 或 { ok:false, status, msg }
async function gate(ip) {
  const ban = db.prepare('SELECT ip FROM ip_bans WHERE ip = ?').get(ip);
  if (ban) return { ok: false, status: 403, msg: '当前 IP 已因多次登录失败被封禁，请联系管理员解封' };

  const maxFail = Math.max(1, Number(settings.get('login_rate_max', '5')) || 5);
  const lockAt = Math.max(3, Number(settings.get('login_lock_threshold', '30')) || 30);
  const hourTs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

  const row = db.prepare('SELECT hour_ts, hour_count, consecutive FROM login_fails WHERE ip = ?').get(ip);
  if (!row || row.hour_ts !== hourTs) return { ok: true, hourTs };
  if (row.consecutive >= lockAt) return { ok: false, status: 403, msg: '连续失败次数过多，当前 IP 已被锁定' };
  if (row.hour_count >= maxFail) return { ok: false, status: 429, msg: '登录尝试过于频繁：每小时最多 ' + maxFail + ' 次，请稍后再试' };
  return { ok: true, hourTs };
}

async function recordFail(ip, hourTs) {
  const ts = hourTs ?? Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  db.prepare(
    `INSERT INTO login_fails (ip, hour_ts, hour_count, consecutive, updated_at)
     VALUES (?, ?, 1, 1, datetime('now'))
     ON CONFLICT(ip) DO UPDATE SET
       hour_count = CASE WHEN hour_ts = excluded.hour_ts THEN hour_count + 1 ELSE 1 END,
       consecutive = consecutive + 1,
       updated_at = datetime('now')`
  ).run(ip, ts);
}

async function clearFails(ip) {
  db.prepare('DELETE FROM login_fails WHERE ip = ?').run(ip);
}

module.exports = { gate, recordFail, clearFails };
