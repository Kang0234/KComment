/**
 * GET  /api/comment?page_key=xxx  查询某页面的树形评论（已脱敏）
 * POST /api/comment               发表 / 回复
 */
import {
  jsonResponse, corsPreflight, clientIp, clientUa,
  toPublic, avatarSeedOf, filterSensitive, escapeHtml,
  validateContent, validateName, rateLimit,
} from '../lib/kc';

const MAX_TOTAL_COMMENTS = 1000; // 演示库总量上限，防滥用

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pageKey = (url.searchParams.get('page_key') || '').trim();
  if (!pageKey) return jsonResponse({ code: 400, msg: '缺少 page_key' }, 400);

  const { results } = await env.DB
    .prepare("SELECT * FROM comments WHERE page_key = ? AND status = 'approved' ORDER BY id ASC")
    .bind(pageKey)
    .all();

  const nodes = new Map();
  for (const row of results) nodes.set(row.id, { comment: toPublic(row), replies: [] });

  const roots = [];
  for (const node of nodes.values()) {
    const pid = node.comment.parent_id;
    if (pid && nodes.has(pid)) nodes.get(pid).replies.push(node);
    else roots.push(node);
  }

  return jsonResponse({ code: 0, data: { count: results.length, roots } });
}

export async function onRequestPost({ request, env }) {
  if (!rateLimit(request, 'write', 20, 60_000)) {
    return jsonResponse({ code: 429, msg: '操作过于频繁，请稍后再试' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ code: 400, msg: '请求体不是合法 JSON' }, 400);
  }
  body = body || {};

  const pageKey = String(body.page_key || '').trim().slice(0, 128);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const isAnon = !!body.is_anonymous;

  if (!pageKey) return jsonResponse({ code: 400, msg: '缺少 page_key' }, 400);

  // 回复场景：parent_id 必须真实存在
  let parentId = null;
  if (body.parent_id != null && body.parent_id !== 0 && body.parent_id !== '') {
    parentId = Number(body.parent_id);
    if (!Number.isInteger(parentId)) return jsonResponse({ code: 400, msg: 'parent_id 格式错误' }, 400);
    const parent = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(parentId).first();
    if (!parent) return jsonResponse({ code: 404, msg: '被回复的评论不存在' }, 404);
  }

  const nameErr = validateName(body.user_name);
  if (nameErr) return jsonResponse({ code: 400, msg: nameErr }, 400);
  const contentErr = validateContent(content);
  if (contentErr) return jsonResponse({ code: 400, msg: contentErr }, 400);

  // 演示库总量保护
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM comments').first();
  if (total && total.n >= MAX_TOTAL_COMMENTS) {
    return jsonResponse({ code: 429, msg: '演示库已满，请自行部署体验完整功能' }, 429);
  }

  // 安全：先转义，再过敏感词（双重防护）
  const safeContent = filterSensitive(escapeHtml(content));
  const userName = isAnon ? '' : String(body.user_name || '').slice(0, 24) || '路人';
  const avatarSeed = await avatarSeedOf(body.user_email);

  const info = await env.DB
    .prepare(
      `INSERT INTO comments
        (page_key, parent_id, user_name, avatar_seed, is_anonymous, content, ip, ua, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`
    )
    .bind(
      pageKey, parentId, userName, avatarSeed, isAnon ? 1 : 0,
      safeContent, clientIp(request), clientUa(request), new Date().toISOString()
    )
    .run();

  const row = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(info.meta.last_row_id).first();
  return jsonResponse({ code: 0, data: toPublic(row) }, 201);
}
