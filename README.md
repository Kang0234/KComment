# Priva Comment

> 对标 Twikoo 的开源评论系统，核心理念：**隐私优先 + 安全治理**。后端干净直白，前端一段脚本即插即用。

## 特点（对比 Twikoo 的增强）

| 能力 | Twikoo | Priva Comment |
| --- | --- | --- |
| 邮箱存储 | 明文可在后台查看 | **只存 md5 哈希**（仅用于头像），绝不明文 |
| IP 暴露 | 后果需自己挡 | **任何对外接口不下发 ip/ua**，仅管理员治理用 |
| 匿名发言 | 需第三方 | **内置匿名模式**：用脱敏昵称替代，真实昵称不下发 |
| 敏感词过滤 | 依赖外部垃圾服务 | **内置 DAG/Trie 词表过滤**，命中替换为 `*`，词表可热改 |
| 防刷点赞 | 无 | **服务端令牌去重**（IP+UA 指纹），同访客只算一次 |
| 管理审核 | 有 | 登录鉴权 + 待审/驳回 + 举报处理 + 心跳提醒 |

## 快速开始

```bash
cp .env.example .env   # 修改 ADMIN_PASSWORD 和 JWT_SECRET
npm install
npm start             # http://localhost:3000
```

打开 `http://localhost:3000/` 即见演示评论页，首次启动自动写入演示数据。

## 接入方式

在任意页面放一个节点并引入脚本即可：

```html
<div id="comment-widget"></div>
<script src="http://localhost:3000/widget/comment-widget.js"></script>
```

脚本默认以 `location.pathname` 作为评论挂载页面；自定义挂载点：

```js
window.privaComment.init({ el: '#comment-widget', server: 'https://your-host.com', pageKey: '/post/42' });
```

## API 一览

### 前台（公开）
- `GET  /api/comment?page_key=xxx` 查询某页面的树形评论（已脱敏）
- `POST /api/comment` 发表/回复；`parent_id` 空为一级评论
- `POST /api/comment/:id/like` 点赞/取消
- `POST /api/comment/:id/report` 举报

### 管理后台（需 `Authorization: Bearer <token>`）
- `POST /api/admin/login` 登录，密码取 `ADMIN_PASSWORD`
- `GET  /api/admin/comments?status=&page=&size=` 列表（含治理字段）
- `PATCH /api/admin/comments/:id/review` 审核（approved/pending/rejected）
- `DELETE /api/admin/comments/:id` 删除（含其回复）
- `GET  /api/admin/heartbeat` 待审/被举报数量心跳
- `GET  /api/admin/reports` 举报列表

## 隐私与安全设计

**隐私**
- 邮箱仅存 `md5` 哈希，头像基于哈希几何图，对外不下发明文；
- 匿名模式下昵称替换为脱敏别名，真实昵称、IP、UA 均不返回；
- 对外统一经 `toPublic()` 清洗，杜绝内部字段泄露。

**安全**
- 敏感词：Trie + DAG 匹配，命中整体替换为 `*`，词表在 `data/sensitive-words.txt`；
- XSS：后端先 HTML 转义再过词表后落库，前端用 `textContent` 渲染，双保险；
- 限流：评论/点赞/举报按 IP 限频，管理登录更严，防暴力破解；
- 防刷：点赞用服务端令牌去重；SQL 全部参数化，抗注入。

## 配置项（.env）

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口 |
| `ADMIN_PASSWORD` | 管理后台密码 |
| `JWT_SECRET` | 管理鉴权签名密钥 |
| `DB_PATH` | SQLite 文件路径 |
| `SEED_DEMO` | 是否自动写入演示数据 |

## 目录结构

```
server.js               # 入口
src/
  config.js             # 配置
  db.js                 # SQLite（WAL）建表
  seed.js               # 演示数据
  services/
    privacy.js          # 脱敏/匿名/头像
    sensitive.js        # 敏感词过滤 + XSS 转义
  middleware/
    auth.js             # JWT 管理鉴权 / 取 IP
    ratelimit.js        # 限流
  routes/
    comments.js         # 前台接口
    admin.js            # 管理后台
public/
  index.html            # 演示页
  widget/               # 前端评论模块
data/
  sensitive-words.txt   # 敏感词表
```