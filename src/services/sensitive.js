'use strict';

const fs = require('fs');
const path = require('path');

// ---------- 安全治理核心 ----------
// 敏感词过滤：用 DAG/Trie 实现，支持词表热更新，命中后整体替换为 *（不泄露命中了什么词）。
// XSS 防护：对外发正文做 HTML 转义，后端同样转义后落库，双重保险。

// 内置少量演示词，真实词表以 data/sensitive-words.txt 为准（一行一个，可空行、可用 # 注释）
const DEFAULT_WORDS = ['色情', '赌博', '代开发票', '加QQ领取红包'];


function loadWords() {
  const file = path.join(__dirname, '..', '..', 'data', 'sensitive-words.txt');
  let words = [];
  try {
    const raw = fs.readFileSync(file, 'utf8');
    words = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch (e) {
    // 文件不存在时返回空词表，不阻塞启动
  }
  return Array.from(new Set([...words, ...DEFAULT_WORDS])).filter(Boolean);
}

class SensitiveFilter {
  constructor() {
    this.words = loadWords();
    this.root = {};
    this.build(this.words);
  }

  // 用每个词建一条 Trie 路径
  build(words) {
    this.root = {};
    for (const w of words) {
      let node = this.root;
      for (const ch of w) {
        if (!node[ch]) node[ch] = {};
        node = node[ch];
      }
      node._end = true;
    }
  }

  reload() {
    this.words = loadWords();
    this.build(this.words);
  }

  // 返回命中的词列表
  match(text) {
    const hits = new Set();
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      let node = this.root;
      for (let j = i; j < chars.length; j++) {
        node = node[chars[j]];
        if (!node) break;
        if (node._end) {
          hits.add(chars.slice(i, j + 1).join(''));
        }
      }
    }
    return Array.from(hits);
  }

  // 过滤：把命中的敏感词替换成等长 *
  filter(text) {
    let clean = text;
    for (const w of this.match(text)) {
      clean = clean.split(w).join('*'.repeat(w.length));
    }
    return clean;
  }
}

// HTML 转义，防止 XSS
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const instance = new SensitiveFilter();
module.exports = { filter: instance, escapeHtml };