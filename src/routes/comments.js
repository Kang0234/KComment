'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const store = require('../store');
const { emailHash, toPublic } = require('../services/privacy');
const { filter: sensitive, escapeHtml } = require('../services/sensitive');
const { clientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/ratelimit');
const settings = require('../services/settings');
const captchaSvc = require('../services/captcha');
const aiModeration = require('../services/aimoderation');

const router = Router();

// 校验正文基础规则：非空、长度、是否纯空白
function validateContent(content) {
  if (typeof content !== 'string') return '评论内容格式错误';
  const len = [...content].length;
  if (len < 1) return '评论内容不能为空';
  if (len > 1000) return '评论内容过长（最多 1000 字）';
  if (!content.trim()) return '评论内容不能为空';
  return null;
}

function validateName(name) {
  if (typeof name !== 'string') return '昵称格式错误';
  const len = [...name].length;
  if (len < 1 || len > 24) return '昵称长度需在 1-24 字之间';
  if (/<|>|&|['"]/.test(name)) return '昵称不能包含特殊字符';
  return null;
}

// 为点赞生成一个匿名 token，固化在客户端 cookie/本地存储，防止刷赞
function clientToken(req) {
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

// ---- 站点公开配置（给前端 widget 用，绝不含密钥）----
router.get('/site-config', async (req, res, next) => {
  try {
    await settings.warm();
    const cap = settings.captchaConfig();
    res.json({
      code: 0,
      data: {
        captcha_required: settings.captchaRequired(),
        captcha: cap.enabled ? { provider: cap.provider, site_key: cap.site_key } : null,
        pre_moderation: settings.preModeration(),
      },
    });
  } catch (e) { next(e); }
});

// ---- 发表评论 / 回复 ----
router.post('/', writeLimiter, async (req, res, next) => {
  try {
    await settings.warm();
    const body = req.body || {};
    const pageKey = String(body.page_key || '').trim().slice(0, 128);
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const isAnon = !!body.is_anonymous;

    if (!pageKey) return res.status(400).json({ code: 400, msg: '缺少 page_key' });

    // 人机验证：后台开启「评论前必须过验证」时强制校验
    const capCfg = settings.captchaConfig();
    if (settings.captchaRequired()) {
      const capResult = await captchaSvc.verify(capCfg, String(body.captcha_token || ''), clientIp(req));
      if (!capResult.ok) return res.status(400).json({ code: 400, msg: capResult.msg });
    }

    // 回复场景：parent_id 必须真实存在
    let parentId = null;
    if (body.parent_id != null && body.parent_id !== 0 && body.parent_id !== '') {
      parentId = Number(body.parent_id);
      const parent = await store.getComment(parentId);
      if (!parent) return res.status(404).json({ code: 404, msg: '被回复的评论不存在' });
    }

    const nameErr = validateName(body.user_name);
    if (nameErr) return res.status(400).json({ code: 400, msg: nameErr });

    const contentErr = validateContent(content);
    if (contentErr) return res.status(400).json({ code: 400, msg: contentErr });

    // 安全：先转义，再过敏感词过滤（双重防护）
    const safeContent = sensitive.filter(escapeHtml(content));

    // ---- 审核链：AI 审核（可选）→ 预审核开关决定初始状态 ----
    let status = 'approved';
    const aiCfg = settings.aiConfig();
    if (aiCfg.enabled) {
      const verdict = await aiModeration.moderate(aiCfg, { content: safeContent, userName: body.user_name });
      status = verdict.status;
    } else if (settings.preModeration()) {
      status = 'pending';
    }

    const id = await store.insertComment({
      page_key: pageKey,
      parent_id: parentId,
      user_name: String(body.user_name).slice(0, 24),
      user_email_hash: emailHash(body.user_email),
      is_anonymous: isAnon ? 1 : 0,
      content: safeContent,
      ip: clientIp(req),
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
      status,
      created_at: new Date().toISOString(),
    });

    const row = await store.getComment(id);
    res.status(201).json({
      code: 0,
      data: toPublic(row),
      meta: { status, message: status === 'pending' ? '评论已提交，审核通过后展示' : undefined },
    });
  } catch (e) { next(e); }
});

// ---- 点赞 / 取消点赞 ----
router.post('/:id/like', writeLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const comment = await store.getComment(id);
    if (!comment || comment.status !== 'approved') {
      return res.status(404).json({ code: 404, msg: '评论不存在' });
    }

    const token = clientToken(req);
    const existing = await store.likeState(id, token);

    let result;
    if (existing.liked) {
      result = await store.likeRemove(id, token);
    } else {
      result = await store.likeAdd(id, token, new Date().toISOString());
    }
    res.json({ code: 0, data: { likes: result.likes, liked: !existing.liked } });
  } catch (e) { next(e); }
});

// ---- 举报 ----
router.post('/:id/report', writeLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const comment = await store.getComment(id);
    if (!comment) return res.status(404).json({ code: 404, msg: '评论不存在' });

    const reason = String((req.body || {}).reason || '').slice(0, 200);
    await store.insertReport(id, reason, clientIp(req), new Date().toISOString());
    res.json({ code: 0, msg: '举报成功，我们会尽快处理' });
  } catch (e) { next(e); }
});

// ---- 查询某页面的评论（树形结构）----
router.get('/', async (req, res, next) => {
  try {
    const pageKey = String(req.query.page_key || '').trim();
    if (!pageKey) return res.status(400).json({ code: 400, msg: '缺少 page_key' });

    const rows = await store.listApproved(pageKey);

    // 轻量脱敏后再构建树，对外绝不下发 ip/ua
    const nodes = new Map();
    rows.forEach((r) => nodes.set(r.id, { comment: toPublic(r), replies: [] }));

    const roots = [];
    nodes.forEach((node) => {
      const pid = node.comment.parent_id;
      if (pid && nodes.has(pid)) {
        nodes.get(pid).replies.push(node);
      } else {
        roots.push(node);
      }
    });

    res.json({ code: 0, data: { count: rows.length, roots } });
  } catch (e) { next(e); }
});

module.exports = router;
