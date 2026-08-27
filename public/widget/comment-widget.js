/*!
 * KComment widget v1.2.0
 * 一段脚本接入评论区，像 Twikoo 一样即插即用。
 * v1.2.0: 支持后台开启的人机验证（hCaptcha / reCAPTCHA v2 & v3 / Turnstile）
 *
 * 用法一（自动挂载，最简）：
 *   <div id="kcomment"></div>
 *   <script src="https://your-server.com/widget/comment-widget.js"></script>
 *
 * 用法二（手动初始化）：
 *   kcomment.init({ el: '#kcomment', server: 'https://your-server.com', pageKey: '/post/42' })
 *
 * 脚本标签上还支持 data-server / data-page-key 属性。
 * 样式可通过 .kc-widget 上的 --kc-* CSS 变量定制。
 */
(function () {
  'use strict';

  var VERSION = '1.1.0';

  /* ------------------------------------------------------------------ *
   * 样式：自动注入，无需额外引入 CSS 文件                                *
   * ------------------------------------------------------------------ */
  var CSS = [
    '.kc-widget{--kc-bg:#fffdf8;--kc-border:#e7e2d6;--kc-border-strong:#d8d2c2;--kc-text:#26221a;--kc-muted:#8d8778;--kc-faint:#b6b0a0;',
    '--kc-accent:#c2402a;--kc-accent-ink:#fff;--kc-accent-weak:rgba(194,64,42,.08);',
    '--kc-radius:10px;--kc-mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;',
    'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;',
    'color:var(--kc-text);background:var(--kc-bg);border:1px solid var(--kc-border);border-radius:var(--kc-radius);',
    'padding:22px 22px 14px;line-height:1.7;font-size:14px;max-width:100%;}',
    '.kc-widget *,.kc-widget *::before,.kc-widget *::after{box-sizing:border-box}',
    '.kc-head{display:flex;align-items:baseline;gap:8px;margin-bottom:16px}',
    '.kc-head .kc-h1{font-size:15px;font-weight:600;letter-spacing:.02em}',
    '.kc-head .kc-h1 .kc-num{font-family:var(--kc-mono);font-weight:400;color:var(--kc-muted);font-size:12.5px}',
    '.kc-head .kc-dim{margin-left:auto;font-family:var(--kc-mono);font-size:11px;color:var(--kc-faint);letter-spacing:.04em}',
    '.kc-editor{margin-bottom:6px}',
    '.kc-editor textarea{width:100%;min-height:86px;resize:vertical;border:1px solid var(--kc-border);border-radius:calc(var(--kc-radius) - 3px);',
    'padding:10px 12px;font:inherit;color:inherit;background:transparent;outline:none;transition:border-color .15s}',
    '.kc-editor textarea::placeholder{color:var(--kc-faint)}',
    '.kc-editor textarea:focus{border-color:var(--kc-accent)}',
    '.kc-fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center}',
    '.kc-fields input{flex:1;min-width:130px;border:1px solid var(--kc-border);border-radius:calc(var(--kc-radius) - 4px);padding:7px 10px;font:inherit;background:transparent;color:inherit;outline:none}',
    '.kc-fields input::placeholder{color:var(--kc-faint)}',
    '.kc-fields input:focus{border-color:var(--kc-accent)}',
    '.kc-anon{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--kc-muted);cursor:pointer;user-select:none;white-space:nowrap}',
    '.kc-anon input{accent-color:var(--kc-accent)}',
    '.kc-toolbar{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px}',
    '.kc-cap-wrap{margin-top:10px;min-height:0}',
    '.kc-hint{font-size:11.5px;color:var(--kc-faint);font-family:var(--kc-mono);letter-spacing:.02em}',
    '.kc-btn{border:none;cursor:pointer;font:inherit;font-size:13px;border-radius:calc(var(--kc-radius) - 4px);padding:7px 18px;',
    'background:var(--kc-text);color:var(--kc-bg);transition:background .15s,opacity .15s;letter-spacing:.06em}',
    '.kc-btn:hover{background:var(--kc-accent);color:var(--kc-accent-ink)}',
    '.kc-btn:disabled{opacity:.45;cursor:not-allowed}',
    '.kc-btn:focus-visible,.kc-act:focus-visible,.kc-fields input:focus-visible,.kc-editor textarea:focus-visible{outline:2px solid var(--kc-accent);outline-offset:1px}',
    '.kc-list,.kc-sub{list-style:none;margin:0;padding:0}',
    '.kc-item{display:flex;gap:12px;padding:14px 0;border-top:1px solid var(--kc-border)}',
    '.kc-sub{margin:10px 0 2px;padding-left:14px;border-left:2px solid var(--kc-border)}',
    '.kc-sub .kc-item{padding:10px 0}',
    '.kc-avatar{width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;',
    'color:#fff;font-size:15px;overflow:hidden}',
    '.kc-avatar svg,.kc-avatar img{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover}',
    '.kc-body{flex:1;min-width:0}',
    '.kc-meta{display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap}',
    '.kc-name{font-weight:600}',
    '.kc-author{font-size:10.5px;color:var(--kc-accent);border:1px solid currentColor;border-radius:3px;padding:0 4px;line-height:1.5;letter-spacing:.08em}',
    '.kc-anon-badge{font-size:10.5px;color:var(--kc-muted);border:1px solid var(--kc-border-strong);border-radius:3px;padding:0 4px;letter-spacing:.08em}',
    '.kc-time{color:var(--kc-faint);font-size:12px;font-variant-numeric:tabular-nums}',
    '.kc-content{white-space:pre-wrap;word-break:break-word;margin-top:2px}',
    '.kc-actions{display:flex;gap:2px;margin-top:6px;align-items:center}',
    '.kc-act{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--kc-muted);cursor:pointer;background:none;',
    'border:none;padding:3px 7px;border-radius:6px;font-family:inherit;transition:color .15s,background .15s}',
    '.kc-act:hover{background:var(--kc-accent-weak);color:var(--kc-accent)}',
    '.kc-act svg{width:13px;height:13px}',
    '.kc-act.liked{color:var(--kc-accent)}',
    '.kc-empty,.kc-loading{color:var(--kc-faint);text-align:center;padding:26px 0;font-size:13px}',
    '.kc-reply-box{margin-top:10px}',
    '.kc-reply-box textarea{min-height:60px}',
    '.kc-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:30px;z-index:9999;background:#26221a;color:#fffdf8;',
    'padding:9px 18px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;letter-spacing:.03em}',
    '.kc-toast.show{opacity:1}',
    '@media (max-width:480px){.kc-widget{padding:16px 14px 10px}.kc-fields input{min-width:100%}}',
    '.kc-widget{position:relative}','.kc-gear{position:absolute;right:12px;bottom:10px;color:var(--kc-faint);opacity:.55;transition:opacity .15s;text-decoration:none;display:inline-flex;padding:4px;border-radius:6px}','.kc-gear:hover{opacity:1;color:var(--kc-accent)}.kc-gear svg{width:15px;height:15px}',
  ].join('');

  function injectCss() {
    if (document.getElementById('kcomment-style')) return;
    var style = document.createElement('style');
    style.id = 'kcomment-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ *
   * 工具函数                                                            *
   * ------------------------------------------------------------------ */
  var ICONS = {
    like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 超过一周回退为日期
  function relTime(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var diff = Date.now() - t;
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.floor(h / 24);
    if (d < 7) return d + ' 天前';
    var dt = new Date(t);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  // 本地几何头像：由头像种子确定性生成，不请求任何第三方
  var AVATAR_PALETTE = ['#c2402a', '#31518c', '#3f7a52', '#a06a22', '#6f5297', '#3a3a33'];
  function strHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function identicon(seed) {
    var h = strHash(String(seed));
    function rnd() { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h; }
    var color = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
    var rects = [];
    var cell = 15, pad = 5;
    for (var y = 0; y < 5; y++) {
      for (var x = 0; x < 3; x++) {
        if (rnd() % 2 === 0) continue;
        [x, 4 - x].forEach(function (cx) {
          rects.push('<rect x="' + (pad + cx * cell) + '" y="' + (pad + y * cell) + '" width="' + (cell - 1.5) + '" height="' + (cell - 1.5) + '" rx="2.5"/>');
        });
      }
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (pad * 2 + cell * 5) + ' ' + (pad * 2 + cell * 5) + '" fill="' + color + '">' + rects.join('') + '</svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function avatarHtml(c) {
    if (c.avatar_seed) {
      return '<div class="kc-avatar"><img src="' + identicon(c.avatar_seed) + '" alt=""></div>';
    }
    if (c.avatar) {
      var img = '<img src="' + escapeHtml(c.avatar) + '" alt="" onerror="this.parentNode.innerHTML=\'\'">';
      return '<div class="kc-avatar" style="background:#8d8778">' + img + '</div>';
    }
    var name = c.user_name || '?';
    return '<div class="kc-avatar" style="background:#8d8778">' + escapeHtml(name.charAt(0).toUpperCase()) + '</div>';
  }

  /* ------------------------------------------------------------------ *
   * 本地记忆：身份 & 点赞状态                                           *
   * ------------------------------------------------------------------ */
  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ------------------------------------------------------------------ *
   * 人机验证（hCaptcha / reCAPTCHA v2/v3 / Turnstile 统一适配）          *
   * ------------------------------------------------------------------ */
  var loadedScripts = {};
  function loadScript(src) {
    if (!loadedScripts[src]) {
      loadedScripts[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = resolve; s.onerror = function () { reject(new Error('script fail')); };
        document.head.appendChild(s);
      });
    }
    return loadedScripts[src];
  }

  var PROVIDERS = {
    hcaptcha: {
      api: 'https://js.hcaptcha.com/1/api.js?render=explicit',
      render: function (slot, key, cb) { return window.hcaptcha.render(slot, { sitekey: key, callback: cb }); },
      token: function (wid) { return window.hcaptcha.getResponse(wid); },
      reset: function (wid) { try { window.hcaptcha.reset(wid); } catch (e) {} },
    },
    recaptcha_v2: {
      api: 'https://www.google.com/recaptcha/api.js',
      render: function (slot, key, cb) { return window.grecaptcha.render(slot, { sitekey: key, callback: cb }); },
      token: function (wid) { return window.grecaptcha.getResponse(wid); },
      reset: function (wid) { try { window.grecaptcha.reset(wid); } catch (e) {} },
    },
    recaptcha_v3: {
      api: 'https://www.google.com/recaptcha/api.js?render=explicit',
      // v3 无可见组件：提交时静默执行取 token
      render: function () { return null; },
      token: function (_wid, key) {
        return window.grecaptcha.execute(key, { action: 'comment' });
      },
      reset: function () {},
    },
    turnstile: {
      api: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      render: function (slot, key, cb) { return window.turnstile.render(slot, { sitekey: key, callback: cb }); },
      token: function (wid) { return window.turnstile.getResponse(wid); },
      reset: function (wid) { try { window.turnstile.reset(wid); } catch (e) {} },
    },
  };

  function fetchSiteConfig(server) {
    return fetch(server + '/api/comment/site-config')
      .then(function (r) { return r.json(); })
      .then(function (res) { return res && res.code === 0 ? res.data : null; })
      .catch(function () { return null; });
  }

  // 在编辑器中渲染验证组件，返回一个 {getToken(): Promise<string>, refresh()} 对象
  function mountCaptcha(container, siteCfg, doneCb) {
    var p = PROVIDERS[siteCfg.captcha.provider];
    var wrap = document.createElement('div');
    wrap.className = 'kc-cap-wrap';
    var slot = document.createElement('div');
    wrap.appendChild(slot);
    container.appendChild(wrap);

    return loadScript(p.api).then(function () {
      var widgetId = p.render(slot, siteCfg.captcha.site_key, function () { if (doneCb) doneCb(); });
      return {
        getToken: function () {
          if (siteCfg.captcha.provider === 'recaptcha_v3') {
            return Promise.resolve(p.token(widgetId, siteCfg.captcha.site_key));
          }
          var t = p.token(widgetId);
          return Promise.resolve(t);
        },
        refresh: function () { p.reset(widgetId); },
      };
    }).catch(function () {
      wrap.textContent = '人机验证组件加载失败';
      return { getToken: function () { return Promise.resolve(''); }, refresh: function () {} };
    });
  }

  /* ------------------------------------------------------------------ *
   * 初始化                                                              *
   * ------------------------------------------------------------------ */
  var scriptEl = (function () {
    // currentScript 仅在脚本执行瞬间可用，这里在 IIFE 顶层捕获
    return document.currentScript || (function () {
      var all = document.querySelectorAll('script[src*="comment-widget"]');
      return all.length ? all[all.length - 1] : null;
    })();
  })();
  var scriptOrigin = '';
  try { if (scriptEl && scriptEl.src) scriptOrigin = new URL(scriptEl.src).origin; } catch (e) { /* ignore */ }

  function init(options) {
    var cfg = options || {};
    var el = typeof cfg.el === 'string' ? document.querySelector(cfg.el) : cfg.el;
    if (!el) { console.warn('[KComment] 未找到挂载节点', cfg.el || '#kcomment'); return; }

    var server = (cfg.server || scriptOrigin || window.location.origin).replace(/\/+$/, '');
    var pageKey = cfg.pageKey || (scriptEl && scriptEl.dataset.pageKey) || window.location.pathname || '/';

    injectCss();
    var siteCfg = null;
    // 站点配置异步拉取，发布前若无配置先补拉一次
    fetchSiteConfig(server).then(function (sc) { siteCfg = sc; });

    var likedMap = loadJson('kcomment_liked', {});
    var identity = loadJson('kcomment_identity', { name: '', email: '', anon: false });

    el.classList.add('kc-widget');

    var state = { total: null };

    function toast(msg) {
      var t = document.querySelector('.kc-toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'kc-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._t);
      t._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
    }

    function json(res, fallback) {
      return res.json().catch(function () { return fallback; });
    }

    /* ---- 输入区 ---- */
    function buildEditor(parentId) {
      var h = document.createElement('div');
      h.className = 'kc-editor';
      if (parentId) h.classList.add('kc-reply-box');
      var fields = parentId ? '' :
        '<input class="kc-name" maxlength="24" placeholder="昵称（可留空）" autocomplete="name">' +
        '<input class="kc-mail" type="email" maxlength="60" placeholder="邮箱（仅用于头像，不公开）" autocomplete="email">';
      h.innerHTML =
        '<textarea placeholder="' + (parentId ? '回复…' : '说点什么。支持匿名。') + '" maxlength="1000"></textarea>' +
        '<div class="kc-fields">' + fields +
        '<label class="kc-anon"><input type="checkbox" class="kc-anon-check">匿名（隐藏昵称）</label></div>' +
        '<div class="kc-box kc-toolbar"><span class="kc-hint">' +
        (parentId ? '昵称与邮箱沿用上方' : '邮箱仅生成头像 · 匿名时不落下任何身份') +
        '</span><button class="kc-btn kc-submit">发布</button></div>';
      if (!parentId) {
        var nameI = h.querySelector('.kc-name');
        var mailI = h.querySelector('.kc-mail');
        var anonI = h.querySelector('.kc-anon-check');
        nameI.value = identity.name || '';
        mailI.value = identity.email || '';
        anonI.checked = !!identity.anon;
      }
      return h;
    }

    function attachEditor(box, parentId) {
      var submit = box.querySelector('.kc-submit');
      var ta = box.querySelector('textarea');
      var busy = false;

      function needCaptcha() {
        return !!(siteCfg && siteCfg.captcha_required && siteCfg.captcha && PROVIDERS[siteCfg.captcha.provider]);
      }

      // 验证组件在编辑器创建时挂载（v3 不可见，挂了也不占位置）
      var capHandle = { getToken: function () { return Promise.resolve(''); }, refresh: function () {} };
      function mountCaptchaIfNeed() {
        if (needCaptcha()) {
          mountCaptcha(box.querySelector('.kc-toolbar'), siteCfg).then(function (h) { capHandle = h; });
        }
      }
      mountCaptchaIfNeed();

      function submitAction() {
        if (busy) return;
        var content = ta.value.trim();
        if (!content) { toast('内容不能为空'); ta.focus(); return; }

        var name = identity.name, email = identity.email, anon = identity.anon;
        if (!parentId) {
          // 主输入区以当前填写为准，并记忆
          name = box.querySelector('.kc-name').value.trim();
          email = box.querySelector('.kc-mail').value.trim();
          anon = box.querySelector('.kc-anon-check').checked;
          identity = { name: name, email: email, anon: anon };
          saveJson('kcomment_identity', identity);
        }
        if (!name && !anon) name = '路人';

        // 人机验证：拿 token 再提交
        var tokenP = Promise.resolve('');
        if (needCaptcha()) {
          submit.disabled = true;
          submit.textContent = '校验中…';
          tokenP = siteCfg.captcha.provider === 'recaptcha_v3'
            ? capHandle.getToken()
            : capHandle.getToken().then(function (t) {
                if (!t) toast('请先完成人机验证');
                return t;
              });
        }

        busy = true;
        submit.disabled = true;
        submit.textContent = '发布中…';
        tokenP
          .then(function (token) {
            return fetch(server + '/api/comment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                page_key: pageKey,
                parent_id: parentId || null,
                user_name: name,
                user_email: email,
                is_anonymous: anon,
                content: content,
                captcha_token: token || undefined,
              }),
            }).then(function (r) { return json(r, { code: -1 }); });
          })
          .then(function (res) {
            if (res.code !== 0) {
              toast(res.msg || '发布失败');
              if (needCaptcha()) { capHandle.refresh(); mountCaptchaIfNeed(); }
              return;
            }
            ta.value = '';
            toast(res.meta && res.meta.message ? res.meta.message : '已发布');
            loadList();
          })
          .catch(function () { toast('网络异常，请稍后再试'); })
          .finally(function () { busy = false; submit.disabled = false; submit.textContent = '发布'; });
      }

      submit.addEventListener('click', submitAction);
      ta.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitAction();
      });
    }

    /* ---- 评论节点 ---- */
    function commentNode(node) {
      var c = node.comment;
      var li = document.createElement('li');
      li.className = 'kc-item';
      li.dataset.id = c.id;

      var nameHtml = escapeHtml(c.user_name || '匿名');
      var badge = c.is_anonymous ? '<span class="kc-anon-badge">匿名</span>' : '';
      var authorMark = c.is_author ? '<span class="kc-author">作者</span>' : '';

      li.innerHTML =
        avatarHtml(c) +
        '<div class="kc-body">' +
        '<div class="kc-meta"><span class="kc-name">' + nameHtml + '</span>' + badge + authorMark +
        '<span class="kc-time">' + relTime(c.created_at) + '</span></div>' +
        '<div class="kc-content"></div>' +
        '<div class="kc-actions">' +
        '<button class="kc-act kc-like' + (likedMap[c.id] ? ' liked' : '') + '" aria-label="点赞">' + ICONS.like + '<span class="n">' + c.likes + '</span></button>' +
        '<button class="kc-act kc-reply" aria-label="回复">' + ICONS.reply + '回复</button>' +
        '<button class="kc-act kc-report" aria-label="举报">' + ICONS.flag + '</button>' +
        '</div></div>';
      li.querySelector('.kc-content').appendChild(document.createTextNode(c.content));

      var box = null;

      // 点赞 / 取消
      li.querySelector('.kc-like').addEventListener('click', function () {
        fetch(server + '/api/comment/' + c.id + '/like', { method: 'POST' })
          .then(function (r) { return json(r, { code: -1 }); })
          .then(function (res) {
            if (res.code !== 0) { toast(res.msg || '操作失败'); return; }
            likedMap[c.id] = res.data.liked;
            if (!res.data.liked) delete likedMap[c.id];
            saveJson('kcomment_liked', likedMap);
            var btn = li.querySelector('.kc-like');
            btn.classList.toggle('liked', !!res.data.liked);
            btn.querySelector('.n').textContent = res.data.likes;
          });
      });

      // 回复
      li.querySelector('.kc-reply').addEventListener('click', function () {
        if (box) { box.remove(); box = null; return; }
        box = buildEditor(c.id);
        attachEditor(box, c.id);
        li.querySelector('.kc-body').appendChild(box);
        box.querySelector('textarea').focus();
      });

      // 举报
      li.querySelector('.kc-report').addEventListener('click', function () {
        fetch(server + '/api/comment/' + c.id + '/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
          .then(function (r) { return json(r, { code: -1 }); })
          .then(function (res) { toast(res.msg || '已收到举报'); });
      });

      // 楼中楼
      if (node.replies && node.replies.length) {
        var sub = document.createElement('ul');
        sub.className = 'kc-sub';
        node.replies.forEach(function (rn) { sub.appendChild(commentNode(rn)); });
        li.querySelector('.kc-body').appendChild(sub);
      }
      return li;
    }

    /* ---- 列表加载 ---- */
    function loadList() {
      var root = el.querySelector('.kc-list');
      if (root) root.remove();
      root = document.createElement('ul');
      root.className = 'kc-list';
      var loader = document.createElement('div');
      loader.className = 'kc-loading';
      loader.textContent = '加载中…';
      el.appendChild(loader);

      fetch(server + '/api/comment?page_key=' + encodeURIComponent(pageKey))
        .then(function (r) { return json(r, { code: -1, data: null }); })
        .then(function (res) {
          loader.remove();
          if (res.code !== 0 || !res.data) {
            var err = document.createElement('div');
            err.className = 'kc-empty';
            err.textContent = '评论加载失败，稍后刷新试试';
            el.appendChild(err);
            return;
          }
          state.total = res.data.count;
          updateTitle();
          if (!res.data.roots.length) {
            var empty = document.createElement('div');
            empty.className = 'kc-empty';
            empty.textContent = '还没有评论，来第一条。';
            el.appendChild(empty);
            return;
          }
          res.data.roots.forEach(function (n) { root.appendChild(commentNode(n)); });
          el.appendChild(root);
        })
        .catch(function () {
          loader.textContent = '评论加载失败，稍后刷新试试';
        });
    }

    function updateTitle() {
      var num = headEl.querySelector('.kc-num');
      if (num && state.total != null) num.textContent = '（' + state.total + '）';
    }

    /* ---- 主体结构 ---- */
    el.innerHTML = '';
    var headEl = document.createElement('div');
    headEl.className = 'kc-head';
    headEl.innerHTML = '<div class="kc-h1">评论<span class="kc-num"></span></div>' +
      '<div class="kc-dim">IP 不下发 · 邮箱只存哈希</div>';
    el.appendChild(headEl);

    var editor = buildEditor(null);
    attachEditor(editor, null);
    el.appendChild(editor);
    loadList();

    // kc-gear-anchor：右下角齿轮，进入管理后台（未登录会先跳登录页）
    try {
      var adminUrl = new URL('/admin', server).href;
      var gear = document.createElement('a');
      gear.className = 'kc-gear';
      gear.href = adminUrl;
      gear.title = '进入管理后台';
      gear.setAttribute('aria-label', '管理后台');
      gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
      el.appendChild(gear);
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ *
   * 对外暴露：kcomment.init()（privaComment 为旧名兼容）                 *
   * ------------------------------------------------------------------ */
  var manualCalled = false;
  function initWrapper(options) {
    manualCalled = true;
    return init(options);
  }

  var kcomment = { init: initWrapper, version: VERSION };
  window.kcomment = kcomment;
  window.privaComment = kcomment;

  /* ---- 自动挂载：存在 #kcomment 或 #comment-widget 即生效（手动 init 过则跳过） ---- */
  function autoMount() {
    if (manualCalled) return;
    var el = document.querySelector('#kcomment') || document.querySelector('#comment-widget');
    if (!el || el.dataset.kcReady === '1') return;
    el.dataset.kcReady = '1';
    var cfg = {};
    if (scriptEl) {
      if (scriptEl.dataset.server) cfg.server = scriptEl.dataset.server;
      if (scriptEl.dataset.pageKey) cfg.pageKey = scriptEl.dataset.pageKey;
    }
    if (el.id === 'comment-widget') cfg.el = el;
    init(cfg);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
