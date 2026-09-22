/*
 * 공통 레이아웃: 헤더(GNB) · 좌측 메뉴(LNB) · 경로 표시 · 페이지 제목을 자동으로 그려 줍니다.
 * 각 페이지는 <body> 안에 자기 내용만 넣고, 맨 끝에 아래 두 줄만 넣으면 됩니다.
 *   <script src="../assets/menu.js"></script>
 *   <script src="../assets/layout.js"></script>
 * (루트의 index.html은 "assets/..." 경로)
 */
(function () {
  'use strict';
  var M = window.PORTAL_MENU;
  var script = document.currentScript;
  var ROOT = script.src.replace(/assets\/layout\.js(\?.*)?$/, '');

  // ----- 현재 페이지 찾기 -----
  var here = location.href.split(/[?#]/)[0];
  var rel = here.indexOf(ROOT) === 0 ? decodeURI(here.slice(ROOT.length)) : '';
  if (rel === '' || rel.slice(-1) === '/') rel += 'index.html';
  var curCat = null, curItem = null;
  M.categories.forEach(function (c) {
    c.items.forEach(function (i) { if (i.file === rel) { curCat = c; curItem = i; } });
  });
  var isHome = rel === 'index.html';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  var url = function (f) { return ROOT + f; };

  // ----- 테마 -----
  var THEME_KEY = 'portal.theme';
  try { var t = localStorage.getItem(THEME_KEY); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}

  var ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    chev: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>'
  };

  // ----- GNB -----
  var tabs = M.categories.map(function (c) {
    var first = c.items[0];
    return '<a href="' + (first ? url(first.file) : '#') + '" class="' + (curCat === c ? 'active' : '') + '">' + esc(c.name) + '</a>';
  }).join('');

  var gnb = document.createElement('header');
  gnb.className = 'gnb';
  gnb.innerHTML =
    '<button class="icon-btn menu-toggle" aria-label="메뉴">' + ICON.menu + '</button>' +
    '<a class="brand" href="' + url('index.html') + '">' + esc(M.title) + '</a>' +
    '<nav class="gnb-tabs">' + tabs + '</nav>' +
    '<div class="gnb-right">' +
      '<div class="gnb-search"><input type="text" placeholder="도구 검색" aria-label="도구 검색"><div class="results"></div></div>' +
      '<button class="icon-btn theme-toggle" aria-label="테마 전환" title="라이트/다크 전환">' + ICON.theme + '</button>' +
    '</div>';

  // ----- LNB -----
  var lnbHtml = '<a class="home-link" href="' + url('index.html') + '">홈</a>' +
    M.categories.map(function (c) {
      var open = curCat ? curCat === c : true;
      return '<div class="cat' + (open ? ' open' : '') + '">' +
        '<button type="button">' + esc(c.name) + '<span class="chev">' + ICON.chev + '</span></button>' +
        '<ul>' + c.items.map(function (i) {
          return '<li><a href="' + url(i.file) + '" class="' + (i === curItem ? 'active' : '') + '">' + esc(i.name) + '</a></li>';
        }).join('') + '</ul></div>';
    }).join('');
  var lnb = document.createElement('aside');
  lnb.className = 'lnb';
  lnb.innerHTML = lnbHtml;

  // ----- 본문 감싸기 -----
  var main = document.createElement('div');
  main.className = 'main-wrap';
  var head = '';
  if (curItem) {
    head = '<div class="breadcrumb"><a href="' + url('index.html') + '">홈</a><span class="sep">›</span>' +
      esc(curCat.name) + '<span class="sep">›</span>' + esc(curItem.name) + '</div>' +
      '<div class="page-head"><h1>' + esc(curItem.name) + '</h1><p>' + esc(curItem.desc || '') + '</p></div>';
    document.title = curItem.name + ' · ' + M.title;
  } else if (isHome) {
    document.title = M.title;
  }
  main.innerHTML = head;

  var nodes = Array.prototype.slice.call(document.body.childNodes).filter(function (n) {
    return !(n.nodeType === 1 && n.tagName === 'SCRIPT');
  });
  nodes.forEach(function (n) { main.appendChild(n); });
  var foot = document.createElement('footer');
  foot.className = 'portal-footer';
  foot.textContent = M.title + ' · 모든 처리는 브라우저 안에서만 이루어지며 입력값은 서버로 전송되지 않습니다.';
  main.appendChild(foot);

  var shell = document.createElement('div');
  shell.className = 'shell';
  var dim = document.createElement('div');
  dim.className = 'lnb-dim';
  shell.appendChild(lnb);
  shell.appendChild(dim);
  shell.appendChild(main);
  document.body.insertBefore(shell, document.body.firstChild);
  document.body.insertBefore(gnb, shell);

  // ----- 동작 -----
  lnb.addEventListener('click', function (e) {
    var b = e.target.closest('.cat > button');
    if (b) b.parentNode.classList.toggle('open');
  });
  gnb.querySelector('.menu-toggle').addEventListener('click', function () { document.body.classList.toggle('lnb-open'); });
  dim.addEventListener('click', function () { document.body.classList.remove('lnb-open'); });
  gnb.querySelector('.theme-toggle').addEventListener('click', function () {
    var root = document.documentElement;
    var cur = root.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  // 검색
  var all = [];
  M.categories.forEach(function (c) { c.items.forEach(function (i) { all.push({ c: c, i: i }); }); });
  var sInput = gnb.querySelector('.gnb-search input');
  var sBox = gnb.querySelector('.gnb-search .results');
  var sel = -1;
  function match(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    return all.filter(function (x) {
      return [x.i.name, x.i.desc, x.c.name, (x.i.tags || []).join(' '), x.i.file].join(' ').toLowerCase().indexOf(q) > -1;
    });
  }
  function renderSearch() {
    var r = match(sInput.value);
    sel = r.length ? 0 : -1;
    if (!sInput.value.trim()) { sBox.classList.remove('open'); return; }
    sBox.innerHTML = r.length ? r.map(function (x, k) {
      return '<a href="' + url(x.i.file) + '" class="' + (k === 0 ? 'sel' : '') + '">' + esc(x.i.name) + '<small>' + esc(x.c.name) + '</small></a>';
    }).join('') : '<div class="empty">결과 없음</div>';
    sBox.classList.add('open');
  }
  sInput.addEventListener('input', renderSearch);
  sInput.addEventListener('focus', renderSearch);
  sInput.addEventListener('keydown', function (e) {
    var links = sBox.querySelectorAll('a');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!links.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach(function (a, k) { a.classList.toggle('sel', k === sel); });
    } else if (e.key === 'Enter' && links[sel]) {
      location.href = links[sel].href;
    } else if (e.key === 'Escape') {
      sBox.classList.remove('open'); sInput.blur();
    }
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.gnb-search')) sBox.classList.remove('open'); });

  // ----- 페이지에서 쓸 공통 유틸 -----
  window.Portal = {
    root: ROOT,
    menu: M,
    current: { category: curCat, item: curItem, file: rel },
    esc: esc,

    /** 텍스트 복사 + 버튼에 잠깐 "복사됨" 표시 */
    copy: function (text, btn) {
      var done = function () {
        if (!btn) return;
        var old = btn.textContent;
        btn.textContent = '복사됨';
        setTimeout(function () { btn.textContent = old; }, 1200);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        ta.remove();
      }
    },

    /** 브라우저에 값 저장/불러오기 (페이지별로 자동 구분) */
    store: {
      key: function (k) { return 'portal:' + rel + ':' + k; },
      get: function (k, def) {
        try { var v = localStorage.getItem(this.key(k)); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
      },
      set: function (k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch (e) {} }
    },

    /**
     * 컨테이너 안의 input/select/textarea(id 있는 것)를 자동 저장·복원.
     * 다시 열면 마지막 입력값이 그대로 남아 있습니다.
     */
    persist: function (container, onRestore) {
      var saved = this.store.get('form', {});
      var fields = container.querySelectorAll('input[id], select[id], textarea[id], input[type=radio][name]');
      fields.forEach(function (el) {
        var k = el.type === 'radio' ? 'r:' + el.name : el.id;
        if (!(k in saved)) return;
        if (el.type === 'checkbox') el.checked = !!saved[k];
        else if (el.type === 'radio') el.checked = el.value === saved[k];
        else el.value = saved[k];
      });
      var self = this;
      var save = function () {
        var out = {};
        fields.forEach(function (el) {
          if (el.type === 'checkbox') out[el.id] = el.checked;
          else if (el.type === 'radio') { if (el.checked) out['r:' + el.name] = el.value; }
          else out[el.id] = el.value;
        });
        self.store.set('form', out);
      };
      container.addEventListener('input', save);
      container.addEventListener('change', save);
      if (onRestore) onRestore(Object.keys(saved).length > 0);
      return { save: save, clear: function () { self.store.set('form', {}); } };
    },

    /** 간단한 SQL 하이라이트 (pre 요소에 넣을 HTML 반환) */
    highlightSql: function (sql) {
      var KW = 'SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|MERGE|INTO|USING|WHEN|MATCHED|THEN|INSERT|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|LIKE|INCLUDING|ALL|DUPLICATE|KEY|BY|TARGET|SOURCE|ORDER|PARTITION|OVER|DESC|ASC|GROUP|HAVING|NULL|IS|BEGIN|TRAN|TRANSACTION|COMMIT|ROLLBACK|START|DISTINCT|UNION|CASE|END|ELSE|BETWEEN|WITH|TOP|LIMIT|TIMESTAMP|DATETIME|DATE';
      var FN = 'ROW_NUMBER|COUNT|TO_DATE|TO_CHAR|CONVERT|CAST|MAX|MIN|SUM|NVL|COALESCE|ISNULL|IFNULL';
      var re = new RegExp("(--[^\\n]*)|('(?:[^']|'')*')|\\b(" + FN + ")\\b(?=\\s*\\()|\\b(" + KW + ")\\b", 'gi');
      var out = '', last = 0, m;
      while ((m = re.exec(sql))) {
        out += esc(sql.slice(last, m.index));
        var cls = m[1] ? 'cm' : m[2] ? 'str' : m[3] ? 'fn' : 'kw';
        out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
        last = re.lastIndex;
      }
      return out + esc(sql.slice(last));
    }
  };
})();
