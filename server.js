'use strict';

const express = require('express');
const path = require('path');
const config = require('./src/config');
const settings = require('./src/services/settings');
const commentsRouter = require('./src/routes/comments');
const adminRouter = require('./src/routes/admin');

const app = express();

// ---- 反向代理信任 ----
// 在 Vercel/Nginx 等代理后面必须开启，否则限流与 IP 记录会被伪造的
// X-Forwarded-For 头绕过。取值：0(不信任) | 1 | 'loopback' 等。
app.set('trust proxy', process.env.TRUST_PROXY === undefined ? 1 : process.env.TRUST_PROXY);

app.disable('x-powered-by');

// ---- 统一安全响应头 ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ---- CORS：仅允许配置的主站来源跨域调用 API/widget ----
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }
  if (origin && !ALLOWED_ORIGINS.includes('*') && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ code: 403, msg: '来源不被允许' });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 解析 JSON 体，并限制体积防滥用
app.use(express.json({ limit: '64kb' }));

// 统一错误兜底
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, msg: '请求体过大' });
  }
  console.error(err);
  res.status(500).json({ code: 500, msg: '服务器内部错误' });
});

// 业务路由
app.use('/api/comment', commentsRouter);
app.use('/api/admin', adminRouter);

// 静态资源：前端评论模块（widget）与管理后台
const staticOpts = { maxAge: '1h' };
app.use('/widget', express.static(path.join(__dirname, 'public', 'widget'), staticOpts));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin'), staticOpts));
app.use('/login', express.static(path.join(__dirname, 'public', 'login'), staticOpts));

// 演示页
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 启动流程：预热设置缓存 → 播种演示数据 → 监听
(async () => {
  try { await settings.warm(); } catch (e) { console.error('设置预热失败:', e.message); }

  // 首次启动且评论为空时，自动写入演示数据（便于开箱即看效果）
  if (config.seedDemo) {
    const store = require('./src/store');
    try {
      const n = await store.commentCount();
      if (n === 0) await require('./src/seed')();
    } catch (e) { console.error('演示数据初始化失败:', e.message); }
  }

  app.listen(config.port, () => {
    const inited = settings.isInitialized();
    console.log(`Priva Comment 已启动: http://localhost:${config.port}`);
    console.log(`  存储后端   : ${process.env.DB_TYPE === 'mongo' ? 'MongoDB' : 'SQLite'}`);
    console.log(`  演示页      : http://localhost:${config.port}/`);
    console.log(`  前端模块   : http://localhost:${config.port}/widget/comment-widget.js`);
    console.log(`  管理后台   : http://localhost:${config.port}/admin/`);
    if (!inited) {
      console.log('');
      console.log('  ⚠️  站点尚未初始化：请先打开管理后台完成安装向导');
      console.log('     （设置管理员密码 / 选择是否开启 AI 审核 / 选择人机验证厂商）');
    }
  });
})();

module.exports = app;
