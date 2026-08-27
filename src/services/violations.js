'use strict';

// ---------- 违禁模式库 ----------
// 后台可维护的模式表：命中（归一化后）即刻拒绝评论并记录审计日志。
// 归一化让变体无法逃逸：「骗：example。com」能拦住「骗:example.com」、
// 全角半角、中文句号冒号、多余空格与零宽字符、大小写。

const db = require('../db');

let cache = null;

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[。，、；｡]/g, '.')
    .replace(/[：（］｛]/g, ':')
    .replace(/［\s*]/g, '[')
    .replace(/[·・••]/g, '.')
    .replace(/[\s\u200b-\u200f]/g, '');
}

function load() {
  if (cache) return cache;
  cache = db.prepare('SELECT id, pattern FROM violation_patterns').all()
    .map((r) => ({ id: r.id, pattern: r.pattern, norm: normalizeText(r.pattern) }));
  return cache;
}

function invalidate() { cache = null; }

// 命中返回 {id, pattern}，否则 null
function match(content) {
  const patterns = load();
  const norm = normalizeText(content);
  for (const p of patterns) {
    if (p.norm && norm.includes(p.norm)) return p;
  }
  return null;
}

module.exports = { normalizeText, match, invalidate };
