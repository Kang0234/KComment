// 生成与 Workers 版一致的 PBKDF2 哈希：pbkdf2:salt:hash (SHA-256, 100000 轮, 32字节)
const crypto = require('crypto');
const pw = process.argv[2];
const iterations = 100_000;
const saltHex = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(pw, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
console.log(`pbkdf2:${saltHex}:${hash}`);
