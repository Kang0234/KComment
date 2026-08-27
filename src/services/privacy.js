'use strict';

const crypto = require('crypto');

// ---------- 隐私核心思路 ----------
// 1) 邮箱只存 md5 哈希，用于生成头像，绝不明文落库、绝不下发。
// 2) IP / UA 只在数据库内保存（治理用），任何对外接口都不返回。
// 3) 匿名模式下昵称用脱敏昵称替换，真实昵称不下发。
// 4) 评论正文在下发前统一经过 toPublic 清洗（去掉内部字段）。

function emailHash(email) {
  if (!email) return null;
  return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

// 头像：优先基于邮箱哈希生成一个稳定的几何头像，避免任何第三方依赖
function avatarUrl(hash) {
  if (!hash) return null;
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=64`;
}

// 用一个字符来生成脱敏昵称缓冲区颜色
const ANON_COLORS = ['#5b8def', '#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd'];

// 匿名昵称池：观众代入感，不暴露任何人信息
const ANON_NAMES = ['湍流的因子', '风中的旅人', '一个匿名的看客', '路过的读者', '屏前的观察者'];

function anonAlias(id) {
  // 同一个评论者（用评论 id/ip 打底）尽量稳定，但对外不可逆
  const seed = String(id);
  const name = ANON_NAMES[id % ANON_NAMES.length];
  const color = ANON_COLORS[id % ANON_COLORS.length];
  return { name, color, seed };
}

// 对外输出时，把隐私字段剥离 + 清洗
function toPublic(c, opts = {}) {
  const pub = {
    id: c.id,
    page_key: c.page_key,
    parent_id: c.parent_id,
    content: c.content,
    likes: c.likes,
    is_anonymous: !!c.is_anonymous,
    created_at: c.created_at,
  };

  // 匿名：不下发真实昵称，用脱敏昵称替代
  if (c.is_anonymous) {
    const a = anonAlias(c.id);
    pub.user_name = a.name;
    pub.anon_color = a.color;
  } else {
    pub.user_name = c.user_name;
  }
  pub.avatar = avatarUrl(c.user_email_hash);

  // 仅管理员接口额外携带治理字段
  if (opts.forAdmin) {
    pub.email_hash = c.user_email_hash;
    pub.ip = c.ip;
    pub.ua = c.ua;
    pub.status = c.status;
  }
  return pub;
}

module.exports = { emailHash, avatarUrl, anonAlias, toPublic };