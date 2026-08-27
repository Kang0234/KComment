'use strict';

const { Router } = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('../services/settings');
const { writeLimiter } = require('../middleware/ratelimit');

const router = Router();

// 图片存储：本地磁盘 data/uploads（Vercel/Mongo 部署时可换 R2）
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
function magicMatches(head) {
  return (
    (head[0] === 0x89 && head[1] === 0x50) ||
    (head[0] === 0xff && head[1] === 0xd8) ||
    (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) ||
    (head[0] === 0x52 && head[4] === 0x57 && head[5] === 0x45 && head[6] === 0x42)
  );
}

// 内存存储以便做魔数与大小校验；上限给宽余量，真实上限由设置决定
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload', writeLimiter, upload.single('file'), async (req, res, next) => {
  try {
    await settings.warm();
    if (settings.get('image_enabled', 'true') !== 'true') {
      return res.status(403).json({ code: 403, msg: '管理员已关闭图片功能' });
    }
    const maxKb = Math.min(8192, Math.max(1, Number(settings.get('image_max_kb', '2048')) || 2048));

    const file = req.file;
    if (!file) return res.status(400).json({ code: 400, msg: '缺少文件字段 file' });

    const ext = ALLOWED[file.mimetype];
    if (!ext) return res.status(400).json({ code: 400, msg: '仅支持 PNG / JPG / WebP / GIF' });
    const head = new Uint8Array(file.buffer.subarray(0, 12));
    if (!magicMatches(head)) return res.status(400).json({ code: 400, msg: '文件内容与声明类型不符' }, false);

    if (file.size > maxKb * 1024) {
      return res.status(400).json({ code: 400, msg: `图片超过大小限制（最大 ${maxKb} KB）` });
    }

    const name =
      crypto.createHash('sha256').update(String(req.ip) + Date.now() + Math.random()).digest('hex').slice(0, 24) +
      '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);

    const origin = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ code: 0, data: { url: `${origin}/files/${name}`, size: file.size, type: file.mimetype } });
  } catch (e) { next(e); }
});

router.get('/files/:key', (req, res) => {
  const key = String(req.params.key || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!key || key.length > 64) return res.status(404).send('not found');
  const fp = path.join(UPLOAD_DIR, key);
  if (!fs.existsSync(fp)) return res.status(404).send('not found');
  const ext = path.extname(key).slice(1);
  const types = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
  res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(fp);
});

module.exports = router;
