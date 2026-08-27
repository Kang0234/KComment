'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const store = require('../store');
const config = require('../config');
const settings = require('../services/settings');
const { signAdmin, requireAdmin, clientIp } = require('../middleware/auth');
const { loginLimiter, adminLimiter } = require('../middleware/ratelimit');
const { toPublic } = require('../services/privacy');
const { hashPassword, verifyPassword, safeEqual } = require('../services/passwords');
const captchaSvc = require('../services/captcha');

const router = Router();

// 判断某一状态是否合法
const STATUS_SET = new Set(['approved', 'pending', 'rejected']);
// 人机验证支持的厂商（对齐前端下拉框）
const CAPTCHA_PROVIDERS = new Set(captchaSvc.KNOWN_PROVIDERS);

function isDefaultAdminPassword() {
  return !config.adminPassword || config.adminPassword === 'ChangeMe123';
}

// ================= 初始化模式（首次安装向导）=================
// 未初始化时仅开放下面两个 setup 接口；后台页面会先展示向导。

router.get('/setup/status', (req, res) => {
  res.json({
    code: 0,
    data: {
      initialized: settings.isInitialized(),
      // 环境变量里已有非默认密码时可走「老用户快速通道」
      legacy_env_password: !isDefaultAdminPassword(),
    },
  });
});

// 老用户快速通道：.env 已配置强密码的用户登录一次即视为完成初始化
router.post('/setup/claim', loginLimiter, async (req, res, next) => {
  try {
    await settings.warm();
    if (settings.isInitialized()) return res.status(400).json({ code: 400, msg: '已完成初始化' });
    if (isDefaultAdminPassword()) {
      return res.status(400).json({ code: 400, msg: '环境变量未配置有效管理密码，请使用初始化向导' });
    }
    const password = String((req.body || {}).password || '');
    if (!safeEqual(password, config.adminPassword)) {
      return res.status(401).json({ code: 401, msg: '密码错误' });
    }
    // 用 env 密码完成初始化：写入哈希 + 生成随机 JWT 密钥
    await finalizeInit({ admin_password_hash: hashPassword(password) });
    res.json({ code: 0, data: { token: signAdmin({ role: 'admin' }) } });
  } catch (e) { next(e); }
});

// 首次安装向导提交
router.post('/setup/init', async (req, res, next) => {
  try {
    await settings.warm();
    if (settings.isInitialized()) return res.status(403).json({ code: 403, msg: '站点已初始化，请直接登录' });

    const body = req.body || {};
    const password = String(body.admin_password || '');

    // 服务端再校验一次密码强度，防止前端被绕过
    const pwErr = validatePassword(password);
    if (pwErr) return res.status(400).json({ code: 400, msg: pwErr });

    const init = { admin_password_hash: hashPassword(password), jwt_secret: randomSecret() };

    // ---- 人机验证配置 ----
    const cap = body.captcha || {};
    if (cap.enabled) {
      if (!CAPTCHA_PROVIDERS.has(cap.provider)) {
        return res.status(400).json({ code: 400, msg: '不支持的人机验证厂商' });
      }
      if (!cap.site_key || !cap.secret_key) {
        return res.status(400).json({ code: 400, msg: '人机验证需要填写 Site Key 和 Secret Key' });
      }
      Object.assign(init, {
        captcha_enabled: 'true',
        captcha_on_comment: cap.on_comment ? 'true' : 'false',
        captcha_provider: cap.provider,
        captcha_site_key: String(cap.site_key),
        captcha_secret_key: String(cap.secret_key),
      });
    }

    // ---- AI 审核配置 ----
    const ai = body.ai_moderation || {};
    if (ai.enabled) {
      if (!ai.base_url || !ai.api_key) {
        return res.status(400).json({ code: 400, msg: 'AI 审核需要填写接口地址和 API Key' });
      }
      Object.assign(init, {
        ai_moderation_enabled: 'true',
        ai_base_url: String(ai.base_url),
        ai_api_key: String(ai.api_key),
        ai_model: String(ai.model || ''),
      });
    }

    if (body.pre_moderation) init.pre_moderation = 'true';

    await finalizeInit(init);

    res.json({ code: 0, data: { token: signAdmin({ role: 'admin' }) } });
  } catch (e) { next(e); }
});

// 检查验证厂商/密钥联通性（初始化前也允许调用，帮向导做测试）
router.post('/setup/test-captcha', async (req, res) => {
  const cap = req.body || {};
  if (!CAPTCHA_PROVIDERS.has(cap.provider)) return res.status(400).json({ code: 400, msg: '不支持的厂商' });
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: String(cap.secret_key || ''), response: 'test-ping' }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    // 只要服务端肯回 JSON，就说明 Secret Key 格式可用了（invalid-input-secret 有专门提示）
    const invalid = data['error-codes']?.includes('invalid-input-secret');
    res.json({ code: 0, data: { reachable: true, secret_valid: !invalid } });
  } catch {
    res.json({ code: 0, data: { reachable: false, secret_valid: null } });
  }
});

async function finalizeInit(obj) {
  obj.initialized = 'true';
  await settings.setMany(obj);
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || [...pw].length < 8) return '管理员密码至少 8 位';
  if (/^\d+$/.test(pw)) return '管理员密码不能是纯数字';
  return null;
}

function randomSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

// ================= 登录（初始化后生效）=================

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    await settings.warm();
    if (!settings.isInitialized()) {
      return res.status(403).json({ code: 403, msg: '站点尚未完成初始化，请先运行安装向导' });
    }
    const password = String((req.body || {}).password || '');
    const storedHash = settings.get('admin_password_hash', '');
    let ok = false;
    if (storedHash) {
      ok = verifyPassword(password, storedHash);
    } else if (!isDefaultAdminPassword()) {
      ok = safeEqual(password, config.adminPassword);
    }
    if (!ok) return res.status(401).json({ code: 401, msg: '密码错误' });
    res.json({ code: 0, data: { token: signAdmin({ role: 'admin' }), expire: '24h' } });
  } catch (e) { next(e); }
});

// 以下接口均需管理员凭证
router.use(requireAdmin, adminLimiter);

// ================= 设置读取 / 修改 =================

function mask(v) {
  if (!v) return '';
  return v.length <= 6 ? '*'.repeat(v.length) : v.slice(0, 3) + '****' + v.slice(-3);
}

router.get('/settings', async (req, res, next) => {
  try {
    await settings.warm();
    res.json({
      code: 0,
      data: {
        pre_moderation: settings.preModeration(),
        captcha: {
          enabled: settings.boolOf(settings.get('captcha_enabled', 'false')),
          on_comment: settings.boolOf(settings.get('captcha_on_comment', 'false')),
          provider: settings.get('captcha_provider', ''),
          site_key: settings.get('captcha_site_key', ''),
          secret_key_masked: mask(settings.get('captcha_secret_key', '')),
        },
        ai_moderation: {
          enabled: settings.boolOf(settings.get('ai_moderation_enabled', 'false')),
          base_url: settings.get('ai_base_url', ''),
          model: settings.get('ai_model', ''),
          api_key_masked: mask(settings.get('ai_api_key', '')),
        },
      },
    });
  } catch (e) { next(e); }
});

router.patch('/settings', async (req, res, next) => {
  try {
    await settings.warm();
    const body = req.body || {};
    const patch = {};

    if (typeof body.pre_moderation === 'boolean') {
      patch.pre_moderation = body.pre_moderation ? 'true' : 'false';
    }

    const cap = body.captcha;
    if (cap && typeof cap === 'object') {
      if (typeof cap.enabled === 'boolean') patch.captcha_enabled = cap.enabled ? 'true' : 'false';
      if (typeof cap.on_comment === 'boolean') patch.captcha_on_comment = cap.on_comment ? 'true' : 'false';
      if (cap.provider !== undefined) {
        if (cap.provider !== '' && !CAPTCHA_PROVIDERS.has(cap.provider)) {
          return res.status(400).json({ code: 400, msg: '不支持的人机验证厂商' });
        }
        patch.captcha_provider = cap.provider;
      }
      if (typeof cap.site_key === 'string') patch.captcha_site_key = cap.site_key.trim();
      if (typeof cap.secret_key === 'string' && cap.secret_key.trim() && !cap.secret_key.includes('****')) {
        patch.captcha_secret_key = cap.secret_key.trim();
      }
    }

    const ai = body.ai_moderation;
    if (ai && typeof ai === 'object') {
      if (typeof ai.enabled === 'boolean') patch.ai_moderation_enabled = ai.enabled ? 'true' : 'false';
      if (typeof ai.base_url === 'string') patch.ai_base_url = ai.base_url.trim();
      if (typeof ai.model === 'string') patch.ai_model = ai.model.trim();
      if (typeof ai.api_key === 'string' && ai.api_key.trim() && !ai.api_key.includes('****')) {
        patch.ai_api_key = ai.api_key.trim();
      }
    }

    await settings.setMany(patch);
    res.json({ code: 0, msg: '已保存' });
  } catch (e) { next(e); }
});

// 修改管理员密码
router.post('/change-password', async (req, res, next) => {
  try {
    await settings.warm();
    const { old_password: oldPw, new_password: newPw } = req.body || {};
    const storedHash = settings.get('admin_password_hash', '');
    let oldOk;
    if (storedHash) oldOk = verifyPassword(String(oldPw || ''), storedHash);
    else oldOk = safeEqual(String(oldPw || ''), config.adminPassword);
    if (!oldOk) return res.status(401).json({ code: 401, msg: '原密码错误' });

    const err = validatePassword(newPw);
    if (err) return res.status(400).json({ code: 400, msg: err });
    await settings.setMany({ admin_password_hash: hashPassword(String(newPw)) });
    res.json({ code: 0, msg: '密码已更新' });
  } catch (e) { next(e); }
});

// ================= 评论治理 =================

// ---- 评论列表（含治理字段 + 举报数）----
router.get('/comments', async (req, res, next) => {
  try {
    const status = String(req.query.status || '');
    const page = Math.max(1, Number(req.query.page || 1));
    const size = Math.min(50, Math.max(1, Number(req.query.size || 20)));
    const validStatus = STATUS_SET.has(status) ? status : null;

    const { rows, total } = await store.adminList({
      status: validStatus,
      limit: size,
      offset: (page - 1) * size,
    });

    res.json({
      code: 0,
      data: {
        list: rows.map((r) => toPublic(r, { forAdmin: true })),
        total,
        page,
        size,
      },
    });
  } catch (e) { next(e); }
});

// ---- 待审数量心跳（供主站 badge 使用）----
router.get('/heartbeat', async (req, res, next) => {
  try {
    const c = await store.counts();
    res.json({ code: 0, data: c });
  } catch (e) { next(e); }
});

// ---- 审核（批准 / 驳回）----
router.patch('/comments/:id/review', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String((req.body || {}).status || '');
    if (!STATUS_SET.has(status)) return res.status(400).json({ code: 400, msg: '无效状态' });

    // 违禁库命中的评论原则上不可展示，需先处理拦截日志
    if (status !== 'rejected') {
      const hit = db.prepare('SELECT id FROM violations WHERE comment_id=?').get(id);
      if (hit) return res.status(403).json({ code: 403, msg: '该评论命中违禁模式库，不可展示；请先在「违禁库」中删除对应拦截日志' });
    }

    const ok = await store.setStatus(id, status);
    if (!ok) return res.status(404).json({ code: 404, msg: '评论不存在' });
    res.json({ code: 0, data: { id, status } });
  } catch (e) { next(e); }
});

// ---- 删除评论（级联删除其回复）----
router.delete('/comments/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await store.deleteCascade(id);
    db.prepare('DELETE FROM violations WHERE comment_id = ?').run(id);
    db.prepare('DELETE FROM like_marks WHERE comment_id = ?').run(id);
    res.json({ code: 0, msg: '已删除' });
  } catch (e) { next(e); }
});

// ---- 全站统计 ----
router.get('/stats', async (req, res, next) => {
  try {
    const base = await store.counts();
    const q = (sql) => db.prepare(sql).get().n;
    res.json({
      code: 0,
      data: {
        ...base,
        approved: q("SELECT COUNT(*) AS n FROM comments WHERE status='approved'"),
        rejected: q("SELECT COUNT(*) AS n FROM comments WHERE status='rejected'"),
        total_likes: q('SELECT COALESCE(SUM(likes),0) AS n FROM comments'),
        pages: q('SELECT COUNT(DISTINCT page_key) AS n FROM comments'),
        violations: q('SELECT COUNT(*) AS n FROM violations'),
      },
    });
  } catch (e) { next(e); }
});

// ---- 违禁模式库 ----
router.get('/violations', (req, res) => {
  const type = String(req.query.type || 'patterns');
  if (type === 'logs') {
    const rows = db.prepare(
      `SELECT v.id, v.comment_id, v.matched_text, v.ip, v.content, v.created_at, c.status AS comment_status
       FROM violations v LEFT JOIN comments c ON c.id = v.comment_id
       ORDER BY v.id DESC LIMIT 100`
    ).all();
    return res.json({ code: 0, data: rows });
  }
  const rows = db.prepare('SELECT id, pattern, note, created_at FROM violation_patterns ORDER BY id DESC').all();
  res.json({ code: 0, data: rows });
});

router.post('/violations', (req, res) => {
  const pattern = String((req.body || {}).pattern || '').trim();
  if (!pattern || pattern.length > 200) return res.status(400).json({ code: 400, msg: '模式内容需为 1-200 字符' });
  if (db.prepare('SELECT id FROM violation_patterns WHERE pattern=?').get(pattern)) {
    return res.status(400).json({ code: 400, msg: '该模式已存在' });
  }
  const info = db.prepare('INSERT INTO violation_patterns (pattern, note, created_at) VALUES (?, ?, ?)')
    .run(pattern, String((req.body || {}).note || '').slice(0, 100) || null, new Date().toISOString());
  violations.invalidate();
  res.json({ code: 0, data: { id: info.lastInsertRowid } });
});

router.delete('/violations/:id', (req, res) => {
  const type = String(req.query.type || 'patterns');
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ code: 400, msg: '参数错误' });
  if (type === 'logs') {
    db.prepare('DELETE FROM violations WHERE id = ?').run(id);
    return res.json({ code: 0, msg: '日志已删除' });
  }
  db.prepare('DELETE FROM violation_patterns WHERE id = ?').run(id);
  violations.invalidate();
  res.json({ code: 0, msg: '模式已删除' });
});

// ---- 举报列表 ----
router.get('/reports', async (req, res, next) => {
  try {
    const rows = await store.reportsLatest(100);
    res.json({ code: 0, data: rows });
  } catch (e) { next(e); }
});

module.exports = router;
