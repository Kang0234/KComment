# KComment

> 对标 Twikoo 的开源评论系统，核心理念：**隐私优先 + 安全治理**。后端干净直白，前端一段脚本即插即用。

**官网**：[https://kc.kang0234.top](https://kc.kang0234.top) · **GitHub**：[https://github.com/Kang0234/KComment](https://github.com/Kang0234/KComment)

- 🔒 **隐私设计**：邮箱只存哈希（仅用于生成头像）、IP/UA 仅管理员可见、绝不下发前端
- 🤖 **AI 审核**（可选）：接入任意 OpenAI 兼容接口（DeepSeek / 智谱 / 通义 / OpenAI…），自动判断广告、辱骂、违法内容
- 🛡 **人机验证**（可选）：支持 hCaptcha、Google reCAPTCHA v2/v3、Cloudflare Turnstile
- 📦 **双存储后端**：本地/自托管用 SQLite；Vercel 云部署用 MongoDB（与 Twikoo 安装方式一致）
- ⚙️ **首次启动初始化向导**：设置管理员密码 → 选择 AI 审核 → 选择人机验证厂商，三步完成
- 🪝 **一段脚本接入**：`<div id="kcomment"></div>` + 一行 `<script>`

---

## 目录

1. [快速开始（本地运行）](#1-快速开始本地运行)
2. [Vercel + MongoDB 部署（推荐，与 Twikoo 安装方式一致）](#2-vercel--mongodb-部署)
3. [管理后台与初始化向导](#3-管理后台与初始化向导)
4. [人机验证配置指南](#4-人机验证配置指南)
5. [在网站中挂载评论区](#5-在网站中挂载评论区)
6. [环境变量总表](#6-环境变量总表)
7. [安全机制说明](#7-安全机制说明)

---

## 1. 快速开始（本地运行）

```bash
git clone https://github.com/Kang0234/KComment.git
cd KComment
npm install
npm start
```

打开 http://localhost:3000/admin/ 即进入 **安装向导**（详见第 3 节），完成后就能使用：

| 地址 | 用途 |
|---|---|
| `/` | 演示页 |
| `/widget/comment-widget.js` | 前端评论组件 |
| `/admin/` | 管理后台 |

数据默认落在 `data/comments.db`（SQLite）。想换位置：在 `.env` 里设置 `DB_PATH=D:/你的目录/comments.db`。

## 2. Vercel + MongoDB 部署

整条链路全部免费额度即可长期运行。

### 第 1 步：创建免费数据库 MongoDB Atlas

1. 注册 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)，新建 **M0 Free** 集群；
2. 左侧 Database Access → 添加用户（用户名/密码）；
3. Network Access → 允许 `0.0.0.0/0`（Vercel 无固定出口 IP）；
4. 复制连接串，形如：
   ```
   mongodb+srv://用户名:密码@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### 第 2 步：Fork 本仓库并导入 Vercel

1. 在 GitHub 上 **Fork** 本仓库；
2. 打开 [Vercel](https://vercel.com) → **Add New… → Project** → 选择你 Fork 的仓库并 Import；
3. Framework Preset 选 **Other**（仓库内已带 vercel.json，无需改构建配置）。

### 第 3 步：配置环境变量

Vercel 项目 → Settings → Environment Variables，添加：

| 变量名 | 值 |
|---|---|
| `DB_TYPE` | `mongo` |
| `MONGODB_URI` | 你的 Atlas 连接串（把末尾补上数据库名，如 `...mongodb.net/kcomment?...`） |
| `MONGODB_DB` | `kcomment` |
| `ALLOWED_ORIGINS` | 你主站的地址，如 `https://example.com`（多个用英文逗号分隔） |

点 **Deploy**。部署完成后得到一个域名，例如 `https://你的项目.vercel.app`。

### 第 4 步：初始化

浏览器打开 `https://你的项目.vercel.app/admin/` → 完成[安装向导](#3-管理后台与初始化向导)。

### （可选）第 5 步：绑定自定义子域名

想让评论服务跑在 `kc.example.com`——

1. 在 Vercel 项目 Settings → Domains 里填 `kc.example.com`，Vercel 会提示需要的 CNAME 目标（一般填 `cname.vercel-dns.com`）；
2. 到你的 DNS 服务商（Cloudflare 用户在 DNS 页面）添加记录：类型 `CNAME`、名称 `kc`、目标 `cname.vercel-dns.com`；若 DNS 托管在 Cloudflare，代理状态建议先设为「仅 DNS」待证书签发后再开代理；
3. 回到 Vercel 等待证书签发完成，访问 `https://kc.example.com/admin/` 验证。

## 3. 管理后台与初始化向导

首次启动（或换新库后首次启动）时，后台只有向导，登录接口被禁用：

1. **管理员密码** — 至少 8 位；scrypt 加盐哈希落库，服务器不留明文。
2. **AI 审核**（可选）— 开启后需要三样东西：
   - 接口地址（OpenAI 兼容 base url，填到版本号为止）
     - DeepSeek：`https://api.deepseek.com/v1`
     - 智谱：`https://open.bigmodel.cn/api/paas/v4`
     - OpenAI：`https://api.openai.com/v1`
   - API Key
   - 模型名，如 `deepseek-chat`、`glm-4-flash`、`gpt-4o-mini`

   审核结果分三档：通过直接展示 / 拒绝丢弃 / 不确定转人工待审。审核服务故障时自动转待审，评论不丢。
3. **人机验证**（可选）— 选厂商、填两把 Key（见下一节）；可单独勾选「发表评论前必须先过验证」。
4. **预审核策略**（可选）— 所有新评论先进待审队列，人工放行才展示。

之后随时可在后台右上角 ⚙ 设置里调整这些开关、更换验证厂商、修改密码。

老版本升级说明：如果 `.env` 里已设置了强 `ADMIN_PASSWORD`，打开后台后点击底部「用旧密码快速初始化」，登录一次即自动迁移为哈希存储并生成随机 JWT 密钥。

## 4. 人机验证配置指南

| 厂商 | 注册入口 | 特点 |
|---|---|---|
| Cloudflare Turnstile | [dash.cloudflare.com → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) | 免费、无需打扰用户，推荐 CF 用户首选 |
| hCaptcha | [dashboard.hcaptcha.com](https://dashboard.hcaptcha.com) | 国际站点常用，隐私友好 |
| reCAPTCHA v2 | [google.com/recaptcha](https://www.google.com/recaptcha/admin) | 经典勾选框 |
| reCAPTCHA v3 | 同上 | 无感打分，低于阈值自动拒绝 |

通用流程（任选一家）：

1. 在该厂商控制台 **Add Site**，填入你的评论系统域名（如 `kc.example.com` 或 `localhost` 用于测试）；
2. 获取 **Site Key**（公开）与 **Secret Key**（保密）；
3. 后台设置里选择对应厂商并粘贴两把 Key，保存即生效，前端会自动加载对应的验证组件。

各家的 Secret Key 只保存在服务端，永远不会下发到浏览器；校验时由 KComment 服务端调用厂商 siteverify 接口完成。

## 5. 在网站中挂载评论区

在你的页面（页脚上方即可）加入：

```html
<div id="kcomment"></div>
<script src="https://kc.example.com/widget/comment-widget.js"
        data-server="https://kc.example.com"></script>
```

或者手动初始化（适合 SPA）：

```html
<div id="kcomment"></div>
<script src="https://kc.example.com/widget/comment-widget.js" defer></script>
<script>window.addEventListener('load', () => kcomment.init({ el:'#kcomment', server:'https://kc.example.com', pageKey:'/post/hello-world' }))</script>
```

- `pageKey` 缺省取当前路径（`location.pathname`），即每个文章页有独立评论楼层；
- 若后台开启了人机验证，组件会自动从 `/api/comment/site-config` 获取配置并渲染对应厂商的组件，无需额外代码。

## 6. 环境变量总表

| 变量 | 默认 | 说明 |
|---|---|---|
| `DB_TYPE` | 空(SQLite) | `mongo` 时启用 MongoDB 后端 |
| `MONGODB_URI` | — | Mongo 连接串（仅 mongo 后端） |
| `MONGODB_DB` | `kcomment` | Mongo 库名 |
| `PORT` | `3000` | 服务端口 |
| `ADMIN_PASSWORD` | 空 | 密码兜底（推荐留空走向导） |
| `JWT_SECRET` | 内置随机 | JWT 兜底密钥（向导会自动生成更强的并持久化） |
| `DB_PATH` | `data/comments.db` | SQLite 文件路径 |
| `SEED_DEMO` | `true` | 首次启动写入演示数据 |
| `ALLOWED_ORIGINS` | `*` | CORS 白名单，生产务必收敛为主站域名 |
| `TRUST_PROXY` | `1` | 是否信任反代的 X-Forwarded-For |

## 7. 安全机制说明

- **认证**：管理员密码 scrypt+盐 哈希存储，登录比对常数时间防时序攻击；JWT 由初始化时生成的 ≥48 字节随机密钥签名，24h 过期；登录接口限速 5 次/分钟。
- **注入/XSS**：全部 SQL 参数化；正文先 HTML 转义再过敏感词 Trie 过滤，双重处理落库；昵称禁止特殊字符。
- **滥用防护**：写操作限速 20 次/分钟/IP；请求体上限 64KB；人机验证 fail-closed（服务端校验失败一律拒绝）。
- **传输与来源**：CORS 白名单由环境变量控制；响应统一附带 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 等安全头；隐藏 `X-Powered-By`。
- **隐私**：邮箱 md5 哈希且不下发明文；IP/UA 只进管理员的治理视图；匿名评论对外完全脱敏。

## License

MIT
