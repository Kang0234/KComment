const fs = require('fs');

// ---------- 官网 + 后台：kmsg → kmenta ----------
for (const f of ['D:/kcomment-website/site/index.html', 'D:/kcomment-website/site/admin/index.html', 'D:/kcomment-website/site/login/index.html', 'D:/kcomment-website/site/assets/kmsg-logo.svg']) {
  let c = fs.readFileSync(f, 'utf8');
  c = c.split('kmsg').join('kmenta');
  c = c.split('kmsg').join('kmenta');
  fs.writeFileSync(f, c);
}
// logo 文件改名
try {
  fs.renameSync('D:/kcomment-website/site/assets/kmsg-logo.svg', 'D:/kcomment-website/site/assets/kmenta-logo.svg');
} catch (e) { console.log('logo rename:', e.message); }
// index.html 里的 logo 引用
{
  let c = fs.readFileSync('D:/kcomment-website/site/index.html', 'utf8');
  c = c.split('/assets/kmsg-logo.svg').join('/assets/kmenta-logo.svg');
  fs.writeFileSync('D:/kcomment-website/site/index.html', c);
}

// ---------- 主仓库落地页 ----------
{
  let c = fs.readFileSync('D:/kcomment/index.html', 'utf8');
  c = c.split('kmsg').join('kmenta');
  fs.writeFileSync('D:/kcomment/index.html', c);
}
console.log('rename kmsg->kmenta done');
