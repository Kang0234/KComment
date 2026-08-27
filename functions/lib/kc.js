/**
 * KComment · Pages Functions 共享库
 * 与自托管 Express 后端（src/）同源的逻辑移植：脱敏、敏感词、限流、鉴权辅助。
 */

/* ---------------- CORS ---------------- */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extraHeaders },
  });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/* ---------------- 请求上下文 ---------------- */
export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

export function clientUa(request) {
  return (request.headers.get('User-Agent') || '').slice(0, 200);
}

// 点赞去重令牌：IP + UA 指纹（与自托管版一致）
export async function clientToken(request) {
  const raw = clientIp(request) + '|' + clientUa(request);
  return await sha256Hex(raw);
}

/* ---------------- 哈希 ---------------- */
export async function sha256Hex(text) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 头像种子：对邮箱哈希再加盐哈希，不可反推邮箱、也无法与其它系统比对
const AVATAR_SALT = 'kcomment-avatar-v1';
export async function avatarSeedOf(email) {
  if (!email) return null;
  return (await sha256Hex(AVATAR_SALT + '|' + email.trim().toLowerCase())).slice(0, 12);
}

/* ---------------- 隐私脱敏 ---------------- */
const ANON_NAMES = ['湍流的因子', '风中的旅人', '一个匿名的看客', '路过的读者', '屏前的观察者'];
const ANON_COLORS = ['#5b8def', '#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd'];

function anonAlias(id) {
  return {
    name: ANON_NAMES[id % ANON_NAMES.length],
    color: ANON_COLORS[id % ANON_COLORS.length],
  };
}

// 对外输出：剥离 ip / ua 等治理字段，匿名时替换昵称
export function toPublic(c) {
  const pub = {
    id: c.id,
    page_key: c.page_key,
    parent_id: c.parent_id,
    content: c.content,
    likes: c.likes,
    is_anonymous: !!c.is_anonymous,
    is_author: !!c.is_author,
    created_at: c.created_at,
    avatar_seed: c.avatar_seed,
  };
  if (c.is_anonymous) {
    const a = anonAlias(c.id);
    pub.user_name = a.name;
    pub.anon_color = a.color;
  } else {
    pub.user_name = c.user_name;
  }
  return pub;
}

/* ---------------- 敏感词（Trie） ---------------- */
const SENSITIVE_WORDS = ['色情', '赌博', '代开发票', '加QQ领取红包'];

const trieRoot = {};
for (const w of SENSITIVE_WORDS) {
  let node = trieRoot;
  for (const ch of w) {
    if (!node[ch]) node[ch] = {};
    node = node[ch];
  }
  node._end = true;
}

function matchWords(text) {
  const hits = new Set();
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    let node = trieRoot;
    for (let j = i; j < chars.length; j++) {
      node = node[chars[j]];
      if (!node) break;
      if (node._end) hits.add(chars.slice(i, j + 1).join(''));
    }
  }
  return [...hits];
}

export function filterSensitive(text) {
  let clean = text;
  for (const w of matchWords(text)) {
    clean = clean.split(w).join('*'.repeat([...w].length));
  }
  return clean;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- 校验 ---------------- */
export function validateContent(content) {
  if (typeof content !== 'string') return '评论内容格式错误';
  const len = [...content].length;
  if (len < 1) return '评论内容不能为空';
  if (len > 1000) return '评论内容过长（最多 1000 字）';
  if (!content.trim()) return '评论内容不能为空';
  return null;
}

export function validateName(name) {
  if (name == null || name === '') return null; // 允许空（匿名 / 路人）
  if (typeof name !== 'string') return '昵称格式错误';
  const len = [...name].length;
  if (len > 24) return '昵称长度需在 1-24 字之间';
  if (/<|>|&|['"]/.test(name)) return '昵称不能包含特殊字符';
  return null;
}

/* ---------------- 限流（isolate 内滑动窗口，尽力而为） ---------------- */
const buckets = new Map();

export function rateLimit(request, bucket, limit, windowMs) {
  const key = bucket + ':' + clientIp(request);
  const now = Date.now();
  let arr = buckets.get(key) || [];
  arr = arr.filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  // 顺手清理过期桶，防内存膨胀
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }
  return true;
}
