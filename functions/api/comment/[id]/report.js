/**
 * POST /api/comment/:id/report  举报
 */
import { jsonResponse, corsPreflight, clientIp, rateLimit } from '../../../lib/kc';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost({ request, env, params }) {
  if (!rateLimit(request, 'write', 20, 60_000)) {
    return jsonResponse({ code: 429, msg: '操作过于频繁，请稍后再试' }, 429);
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) return jsonResponse({ code: 400, msg: '参数错误' }, 400);

  const comment = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
  if (!comment) return jsonResponse({ code: 404, msg: '评论不存在' }, 404);

  let reason = '';
  try {
    const body = await request.json();
    reason = String((body || {}).reason || '').slice(0, 200);
  } catch (e) { /* 举报允许空 body */ }

  await env.DB
    .prepare('INSERT INTO reports (comment_id, reason, ip, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, reason, clientIp(request), new Date().toISOString())
    .run();

  return jsonResponse({ code: 0, msg: '举报成功，我们会尽快处理' });
}
