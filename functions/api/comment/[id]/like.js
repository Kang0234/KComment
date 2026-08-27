/**
 * POST /api/comment/:id/like  点赞 / 取消（服务端令牌去重）
 */
import { jsonResponse, corsPreflight, clientToken, rateLimit } from '../../../lib/kc';

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost({ request, env, params }) {
  if (!rateLimit(request, 'write', 20, 60_000)) {
    return jsonResponse({ code: 429, msg: '操作过于频繁，请稍后再试' }, 429);
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) return jsonResponse({ code: 400, msg: '参数错误' }, 400);

  const comment = await env.DB
    .prepare("SELECT id, status FROM comments WHERE id = ?")
    .bind(id)
    .first();
  if (!comment || comment.status !== 'approved') {
    return jsonResponse({ code: 404, msg: '评论不存在' }, 404);
  }

  const token = await clientToken(request);
  const existing = await env.DB
    .prepare('SELECT comment_id FROM like_marks WHERE comment_id = ? AND token = ?')
    .bind(id, token)
    .first();

  if (existing) {
    await env.DB.prepare('DELETE FROM like_marks WHERE comment_id = ? AND token = ?').bind(id, token).run();
    await env.DB.prepare('UPDATE comments SET likes = MAX(0, likes - 1) WHERE id = ?').bind(id).run();
  } else {
    await env.DB
      .prepare('INSERT OR IGNORE INTO like_marks (comment_id, token, created_at) VALUES (?, ?, ?)')
      .bind(id, token, new Date().toISOString())
      .run();
    await env.DB.prepare('UPDATE comments SET likes = likes + 1 WHERE id = ?').bind(id).run();
  }

  const row = await env.DB.prepare('SELECT likes FROM comments WHERE id = ?').bind(id).first();
  return jsonResponse({ code: 0, data: { likes: row.likes, liked: !existing } });
}
