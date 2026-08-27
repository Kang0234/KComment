'use strict';

// ---------- 运行时设置存储 ----------
// 所有后台可调项（初始化向导写入）统一经存储层（SQLite/MongoDB）持久化。
// 因为 Mongo 驱动是异步的，这里采用「启动时全量预热 + 内存读 + 异步写回」：
//   - 请求内读取一律走内存缓存，保持同步、零延迟；
//   - 写操作返回 Promise，路由里 await 落库后再响应。

const store = require('../store');

const cache = new Map();
let warmed = false;

// 全部已知键名：warm() 时批量拉取
const KEYS = [
  'initialized',
  'admin_password_hash',
  'jwt_secret',
  'pre_moderation',
  'captcha_enabled', 'captcha_on_comment', 'captcha_provider', 'captcha_site_key', 'captcha_secret_key',
  'ai_moderation_enabled', 'ai_base_url', 'ai_api_key', 'ai_model',
];

async function warm() {
  if (warmed) return;
  for (const k of KEYS) {
    if (!cache.has(k)) {
      // eslint-disable-next-line no-await-in-loop
      const v = await store.settingGet(k);
      if (v !== null) cache.set(k, v);
    }
  }
  warmed = true;
}

function get(key, def = null) {
  return cache.has(key) ? cache.get(key) : def;
}

async function set(key, value) {
  await store.settingSet(key, String(value));
  cache.set(key, String(value));
}

async function setMany(obj) {
  for (const [k, v] of Object.entries(obj)) {
    // eslint-disable-next-line no-await-in-loop
    await set(k, v);
  }
}

function boolOf(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return v === true || v === 'true' || v === '1';
}

// 组合读取：初始化状态
function isInitialized() {
  return boolOf(get('initialized', 'false'));
}

// 是否开启了强制人机验证才能发评论
function captchaRequired() {
  if (!boolOf(get('captcha_enabled', 'false'))) return false;
  return boolOf(get('captcha_on_comment', 'false'));
}

// 人机验证配置（含密钥，绝不直接下发前端）
function captchaConfig() {
  return {
    enabled: boolOf(get('captcha_enabled', 'false')),
    on_comment: boolOf(get('captcha_on_comment', 'false')),
    provider: get('captcha_provider', ''),
    site_key: get('captcha_site_key', ''),
    secret_key: get('captcha_secret_key', ''),
  };
}

// AI 审核配置
function aiConfig() {
  return {
    enabled: boolOf(get('ai_moderation_enabled', 'false')),
    base_url: get('ai_base_url', ''),
    api_key: get('ai_api_key', ''),
    model: get('ai_model', ''),
  };
}

// 预审核开关：开启后新评论一律先进 pending，人工通过后才展示
function preModeration() {
  return boolOf(get('pre_moderation', 'false'));
}

module.exports = { warm, get, set, setMany, boolOf, isInitialized, captchaRequired, captchaConfig, aiConfig, preModeration };
