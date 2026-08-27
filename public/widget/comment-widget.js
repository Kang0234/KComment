/* Priva Comment 前端模块 —— 一个 script 即可挂载 */
(function () {
  'use strict';

  var DEFAULTS = {
    el: '#comment-widget',
    server: 'http://localhost:3000',
    pageKey: null, // 缺省用 location.pathname
  };

  function init(options) {
    var cfg = Object.assign({}, DEFAULTS, options || {});
    var el = typeof cfg.el === 'string' ? document.querySelector(cfg.el) : cfg.el;
    if (!el) return console.warn('[PrivaComment] 未找到挂载节点', cfg.el);

    var pageKey = cfg.pageKey || window.location.pathname || '/';
    var api = cfg.server.replace(/\/$/, '');

    var likedMap = loadLiked(); // 本地记住已点赞，跨会话保留
    var state = { total: null, loaded: false };

    el.classList.add('pc-widget');

    function toast(msg) {
      var t = document.querySelector('.pc-toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'pc-toast';
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

    function buildEditor(parentId) {
      var h = document.createElement('div');
      h.className = 'pc-editor';
      h.innerHTML =
        '<textarea placeholder="友好地说点什么吧…"></textarea>' +
        '<div class="pc-fields">' +
        '  <input class="pc-name" maxlength="24" placeholder="昵称（可留空）">' +
        '  <input class="pc-mail" type="email" placeholder="邮箱（仅生成头像，不公开）">' +
        '  <label class="pc-anon"><input type="checkbox" class="pc-anon-check"> 匿名（隐藏昵称）</label>' +
        '</div>' +
        '<div class="pc-box">' +
        '  <span class="pc-hint">昵称邮箱仅在本地，匿名时更加安全</span>' +
        '  <button class="pc-btn pc-submit">发表</button>' +
        '</div>';
      parentId && h.querySelector('textarea').setAttribute('placeholder', '回复他/她…');
      return h;
    }

    function attachEditor(box, parentId) {
      var submit = box.querySelector('.pc-submit');
      var ta = box.querySelector('textarea');
      submit.addEventListener('click', function () {
        var payload = {
          page_key: pageKey,
          parent_id: parentId || null,
          user_name: box.querySelector('.pc-name').value.trim(),
          user_email: box.querySelector('.pc-mail').value.trim(),
          is_anonymous: box.querySelector('.pc-anon-check').checked,
          content: ta.value.trim(),
        };
        if (!payload.user_name && !payload.is_anonymous) {
          payload.user_name = '路人';
        }
        submit.disabled = true;
        fetch(api + '/api/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) { return json(r, { code: -1 }); })
          .then(function (res) {
            if (res.code !== 0) { toast(res.msg || '发表失败'); return; }
            ta.value = '';
            toast('发表成功');
            loadList();
          })
          .catch(function () { toast('网络异常'); })
          .finally(function () { submit.disabled = false; });
      });
    }

    var fmtTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
    function time(t) { return fmtTime.format(new Date(t)); }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    function commentNode(node) {
      var c = node.comment;
      var li = document.createElement('li');
      li.className = 'pc-item';
      li.dataset.id = c.id;

      var avatar;
      if (c.is_anonymous) {
        avatar = '<div class="pc-avatar" style="background:' + (c.anon_color || '#8a919c') + '">匿</div>';
      } else if (c.avatar) {
        avatar = '<div class="pc-avatar"><img src="' + c.avatar + '" alt=""></div>';
      } else {
        avatar = '<div class="pc-avatar" style="background:#8a919c">' + escapeHtml((c.user_name || '?')[0]) + '</div>';
      }

      var nameHtml = escapeHtml(c.user_name || '匿名');
      var badge = c.is_anonymous ? '<span class="pc-anon-badge">匿名</span>' : '';

      var html =
        '<div class="pc-body">' +
        '  <div class="pc-meta">' + avatar + '<span class="pc-name">' + nameHtml + '</span>' + badge +
        '    <span class="pc-time">' + time(c.created_at) + '</span></div>' +
        '  <div class="pc-content"></div>' +
        '  <div class="pc-actions">' +
        '    <button class="pc-act pc-like' + (likedMap[c.id] ? ' liked' : '') + '">👍 ' + c.likes + '</button>' +
        '    <button class="pc-act pc-reply">回复</button>' +
        '    <button class="pc-act pc-report">举报</button>' +
        '  </div>' +
        '</div>';
      li.innerHTML = html;
      li.querySelector('.pc-content').appendChild(document.createTextNode(c.content));

      var box = null;

      // 点赞
      li.querySelector('.pc-like').addEventListener('click', function () {
        fetch(api + '/api/comment/' + c.id + '/like', { method: 'POST' })
          .then(function (r) { return json(r, { code: -1 }); })
          .then(function (res) {
            if (res.code !== 0) { toast(res.msg || '操作失败'); return; }
            likedMap[c.id] = res.data.liked;
            saveLiked(likedMap);
            li.querySelector('.pc-like').textContent = '👍 ' + res.data.likes;
            li.querySelector('.pc-like').classList.toggle('liked', res.data.liked);
          });
      });

      // 回复：在主内容下方展开一个输入框
      li.querySelector('.pc-reply').addEventListener('click', function () {
        if (box) { box.remove(); box = null; return; }
        box = buildEditor(c.id);
        attachEditor(box, c.id);
        li.querySelector('.pc-body').appendChild(box);
      });

      // 举报
      li.querySelector('.pc-report').addEventListener('click', function () {
        fetch(api + '/api/comment/' + c.id + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(function (r) { return json(r, { code: -1 }); })
          .then(function (res) { toast(res.msg || '已提交举报'); });
      });

      // 递归画回复
      if (node.replies && node.replies.length) {
        var sub = document.createElement('ul');
        sub.className = 'pc-sub';
        node.replies.forEach(function (rn) { sub.appendChild(commentNode(rn)); });
        li.querySelector('.pc-body').appendChild(sub);
      }
      return li;
    }

    function loadList() {
      state.loaded = false;
      var root = el.querySelector('.pc-root');
      if (root) root.remove();
      root = document.createElement('ul');
      root.className = 'pc-root';
      var loader = document.createElement('div');
      loader.className = 'pc-loading';
      loader.textContent = '加载中…';
      el.appendChild(loader);

      fetch(api + '/api/comment?page_key=' + encodeURIComponent(pageKey))
        .then(function (r) { return json(r, { code: -1, data: null }); })
        .then(function (res) {
          loader.remove();
          if (res.code !== 0) { loader.textContent = '加载失败'; el.appendChild(loader); return; }
          state.total = res.data.count;
          updateTitle();
          if (!res.data.roots.length) {
            var empty = document.createElement('div');
            empty.className = 'pc-empty';
            empty.textContent = '还没有评论，来抢沙发～';
            el.appendChild(empty);
            return;
          }
          res.data.roots.forEach(function (n) { root.appendChild(commentNode(n)); });
          el.appendChild(root);
          state.loaded = true;
        })
        .catch(function () { loader.textContent = '加载失败'; });
    }

    // 主体结构
    el.innerHTML = '';
    var title = document.createElement('h3');
    title.className = 'pc-title';
    title.innerHTML = '评论<span class="pc-count"></span>';
    el.appendChild(title);
    var editor = buildEditor(null);
    attachEditor(editor, null);
    el.appendChild(editor);
    loadList();

    function updateTitle() {
      var c = title.querySelector('.pc-count');
      if (state.total != null) c.textContent = '（' + state.total + '）';
    }
  }

  // 本地点赞记忆
  function loadLiked() {
    try { return JSON.parse(localStorage.getItem('pc_liked') || '{}'); } catch (e) { return {}; }
  }
  function saveLiked(map) {
    try { localStorage.setItem('pc_liked', JSON.stringify(map)); } catch (e) {}
  }

  // 三种使用方式：window.privaComment.init() 或 DOMContentLoaded 自动初始化
  window.privaComment = { init: init };

  function auto() {
    if (document.querySelector('#comment-widget')) {
      init({ el: '#comment-widget' });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
  else auto();
})();