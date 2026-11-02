/*
 * Mermaid 에디터 — 캔버스에 흐름도를 그리면 Mermaid flowchart 코드로 바꿔 준다.
 * 상태: doc = { seq, nodes:[{id,x,y,t,s}], edges:[{id,a,b,t,k}] }  (x,y는 노드 중심)
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // 모양 → Mermaid 노드 괄호
  var SHAPES = {
    rect: ['[', ']'], round: ['(', ')'], stadium: ['([', '])'], diamond: ['{', '}'],
    io: ['[/', '/]'], db: ['[(', ')]'], circle: ['((', '))']
  };
  // 선 → Mermaid 연결
  var LINKS = { arrow: '-->', dot: '-.->', thick: '==>', line: '---' };
  var SNAP = 10, MIN_H = 560, HANDLE_R = 9;

  var wrap = $('feScroll'), svg = $('feSvg'), meas = $('feMeasure');
  var edit = wrap.querySelector('.fe-edit');

  var doc = Portal.store.get('doc', null);
  if (!doc || !doc.nodes || !doc.edges) doc = { seq: 0, nodes: [], edges: [] };
  var undoStack = [], redoStack = [];
  var sel = null;       // { k: 'n'|'e', id }
  var hover = null;     // 마우스가 올라간 노드 id
  var drag = null;      // { mode: 'move'|'link', ... }
  var editing = null;   // { k, id }
  var def = Portal.store.get('def', null) || {};   // 새로 그릴 노드 모양·선 기본값
  if (!SHAPES[def.shape]) def.shape = 'rect';
  if (!LINKS[def.edge]) def.edge = 'arrow';

  // ---------- 기본 도우미 ----------
  function node(id) { for (var i = 0; i < doc.nodes.length; i++) if (doc.nodes[i].id === id) return doc.nodes[i]; return null; }
  function edge(id) { for (var i = 0; i < doc.edges.length; i++) if (doc.edges[i].id === id) return doc.edges[i]; return null; }
  function snap(v) { return Math.round(v / SNAP) * SNAP; }
  function snapshot() { return JSON.stringify(doc); }
  function save() { Portal.store.set('doc', doc); }
  function radio(name) { var r = $('form').querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function setRadio(name, v) { var r = $('form').querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; }

  // 바뀐 게 있으면 되돌리기 기록 + 저장
  function push(before) {
    undoStack.push(before);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    save();
  }
  function change(fn) {
    var before = snapshot();
    fn();
    if (snapshot() !== before) push(before);
    render();
  }

  // ---------- 크기·모양 ----------
  var mcache = {};
  function textW(t) {
    if (!(t in mcache)) { meas.textContent = t; mcache[t] = meas.getComputedTextLength(); }
    return mcache[t];
  }
  function dims(n) {
    var w = textW(n.t || ' ');
    switch (n.s) {
      case 'circle': var d = Math.max(60, w + 28); return { w: d, h: d };
      case 'diamond': return { w: Math.max(100, w * 1.4 + 40), h: 64 };
      case 'db': return { w: Math.max(80, w + 32), h: 54 };
      case 'io': return { w: Math.max(90, w + 48), h: 40 };
      case 'stadium': return { w: Math.max(80, w + 44), h: 40 };
      default: return { w: Math.max(80, w + 32), h: 40 };
    }
  }
  function rectSvg(hw, hh, r) {
    return '<rect class="fe-shape" x="' + -hw + '" y="' + -hh + '" width="' + hw * 2 + '" height="' + hh * 2 + '" rx="' + r + '"/>';
  }
  function shapeSvg(s, w, h) {
    var hw = w / 2, hh = h / 2, e = 7, k = 10;
    switch (s) {
      case 'round': return rectSvg(hw, hh, 10);
      case 'stadium': return rectSvg(hw, hh, hh);
      case 'diamond': return '<polygon class="fe-shape" points="0,' + -hh + ' ' + hw + ',0 0,' + hh + ' ' + -hw + ',0"/>';
      case 'circle': return '<circle class="fe-shape" r="' + hw + '"/>';
      case 'io': return '<polygon class="fe-shape" points="' + (-hw + k) + ',' + -hh + ' ' + hw + ',' + -hh + ' ' + (hw - k) + ',' + hh + ' ' + -hw + ',' + hh + '"/>';
      case 'db':
        return '<path class="fe-shape" d="M' + -hw + ',' + (-hh + e) + ' A' + hw + ',' + e + ' 0 0 1 ' + hw + ',' + (-hh + e) +
          ' V' + (hh - e) + ' A' + hw + ',' + e + ' 0 0 1 ' + -hw + ',' + (hh - e) + ' Z"/>' +
          '<path class="fe-shape fe-open" d="M' + -hw + ',' + (-hh + e) + ' A' + hw + ',' + e + ' 0 0 0 ' + hw + ',' + (-hh + e) + '"/>';
      default: return rectSvg(hw, hh, 3);
    }
  }

  // 노드 중심에서 (dx,dy) 방향으로 나갔을 때 테두리와 만나는 점
  function clip(n, dx, dy) {
    var d = dims(n), t;
    if (!dx && !dy) return { x: n.x, y: n.y };
    if (n.s === 'circle') t = (d.w / 2) / Math.sqrt(dx * dx + dy * dy);
    else if (n.s === 'diamond') t = 1 / (Math.abs(dx) / (d.w / 2) + Math.abs(dy) / (d.h / 2));
    else t = Math.min(dx ? (d.w / 2) / Math.abs(dx) : Infinity, dy ? (d.h / 2) / Math.abs(dy) : Infinity);
    return { x: n.x + dx * t, y: n.y + dy * t };
  }
  // 선 양 끝점 (반대 방향 선이 함께 있으면 서로 비켜 그림)
  function edgeGeo(e) {
    var a = node(e.a), b = node(e.b);
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1, off = 0;
    for (var i = 0; i < doc.edges.length; i++) if (doc.edges[i].a === e.b && doc.edges[i].b === e.a) off = 6;
    var ox = -dy / len * off, oy = dx / len * off;
    var p = clip(a, dx, dy), q = clip(b, -dx, -dy);
    return { x1: p.x + ox, y1: p.y + oy, x2: q.x + ox, y2: q.y + oy };
  }
  function handlesOf(n) {
    var d = dims(n);
    return [[n.x, n.y - d.h / 2], [n.x + d.w / 2, n.y], [n.x, n.y + d.h / 2], [n.x - d.w / 2, n.y]];
  }
  function handleNodes() {
    var ids = [];
    if (sel && sel.k === 'n') ids.push(sel.id);
    if (hover !== null && ids.indexOf(hover) < 0) ids.push(hover);
    return ids.map(node).filter(Boolean);
  }
  function validEdges() {
    return doc.edges.filter(function (e) { return node(e.a) && node(e.b); });
  }

  // ---------- 찾기 (마우스 위치 → 대상) ----------
  function hitNode(x, y) {
    for (var i = doc.nodes.length - 1; i >= 0; i--) {
      var n = doc.nodes[i], d = dims(n);
      if (Math.abs(x - n.x) <= d.w / 2 + 2 && Math.abs(y - n.y) <= d.h / 2 + 2) return n;
    }
    return null;
  }
  function hitHandle(x, y) {
    var ns = handleNodes();
    for (var i = 0; i < ns.length; i++) {
      var hs = handlesOf(ns[i]);
      for (var j = 0; j < hs.length; j++) {
        if (Math.abs(x - hs[j][0]) <= HANDLE_R && Math.abs(y - hs[j][1]) <= HANDLE_R) return ns[i];
      }
    }
    return null;
  }
  function segDist(px, py, g) {
    var vx = g.x2 - g.x1, vy = g.y2 - g.y1, l2 = vx * vx + vy * vy;
    var t = l2 ? Math.max(0, Math.min(1, ((px - g.x1) * vx + (py - g.y1) * vy) / l2)) : 0;
    var cx = g.x1 + vx * t - px, cy = g.y1 + vy * t - py;
    return Math.sqrt(cx * cx + cy * cy);
  }
  function hitEdge(x, y) {
    var es = validEdges();
    for (var i = es.length - 1; i >= 0; i--) {
      var g = edgeGeo(es[i]);
      if (segDist(x, y, g) <= 7) return es[i];
      if (es[i].t) {
        var mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2, hw = labelW(es[i].t) / 2;
        if (Math.abs(x - mx) <= hw && Math.abs(y - my) <= 10) return es[i];
      }
    }
    return null;
  }
  function labelW(t) { return textW(t) * 13 / 14 + 12; }

  // ---------- 그리기 ----------
  var DEFS = '<defs>' +
    '<pattern id="feGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path class="fe-grid" d="M20 0H0V20"/></pattern>' +
    '<marker id="feArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="fe-ah" d="M0,0 L10,5 L0,10 z"/></marker>' +
    '<marker id="feArrowOn" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="fe-ah on" d="M0,0 L10,5 L0,10 z"/></marker>' +
    '</defs>';

  function syncSeg() {
    var o;
    if (sel && sel.k === 'n' && (o = node(sel.id))) { setRadio('shape', o.s); setRadio('edge', def.edge); }
    else if (sel && sel.k === 'e' && (o = edge(sel.id))) { setRadio('edge', o.k); setRadio('shape', def.shape); }
    else { setRadio('shape', def.shape); setRadio('edge', def.edge); }
  }

  function render() {
    if (sel && !(sel.k === 'n' ? node(sel.id) : edge(sel.id))) sel = null;
    if (hover !== null && !node(hover)) hover = null;

    var maxX = 0, maxY = 0;
    doc.nodes.forEach(function (n) { var d = dims(n); maxX = Math.max(maxX, n.x + d.w / 2); maxY = Math.max(maxY, n.y + d.h / 2); });
    var W = Math.max(wrap.clientWidth, maxX + 160), H = Math.max(MIN_H - 2, maxY + 160);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    var h = [DEFS, '<rect width="100%" height="100%" fill="url(#feGrid)"/>'];

    validEdges().forEach(function (e) {
      var g = edgeGeo(e), on = !!(sel && sel.k === 'e' && sel.id === e.id);
      var mk = e.k === 'line' ? '' : ' marker-end="url(#feArrow' + (on ? 'On' : '') + ')"';
      h.push('<g class="fe-edge fe-' + e.k + (on ? ' sel' : '') + '"><line x1="' + g.x1 + '" y1="' + g.y1 + '" x2="' + g.x2 + '" y2="' + g.y2 + '"' + mk + '/>');
      if (e.t) {
        var mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2, lw = labelW(e.t);
        h.push('<rect class="fe-lbg" x="' + (mx - lw / 2) + '" y="' + (my - 10) + '" width="' + lw + '" height="20" rx="3"/>' +
          '<text class="fe-lbl" x="' + mx + '" y="' + my + '">' + Portal.esc(e.t) + '</text>');
      }
      h.push('</g>');
    });

    doc.nodes.forEach(function (n) {
      var d = dims(n), cls = 'fe-node';
      if (sel && sel.k === 'n' && sel.id === n.id) cls += ' sel';
      if (drag && drag.mode === 'link' && drag.drop === n.id) cls += ' drop';
      h.push('<g class="' + cls + '" transform="translate(' + n.x + ',' + n.y + ')">' + shapeSvg(n.s, d.w, d.h) +
        '<text class="fe-txt">' + Portal.esc(n.t) + '</text></g>');
    });

    if (!drag || drag.mode !== 'move') {
      handleNodes().forEach(function (n) {
        handlesOf(n).forEach(function (p) { h.push('<circle class="fe-h" cx="' + p[0] + '" cy="' + p[1] + '" r="5"/>'); });
      });
    }

    if (drag && drag.mode === 'link') {
      var a = node(drag.from), s = clip(a, drag.x - a.x, drag.y - a.y);
      h.push('<line class="fe-temp" x1="' + s.x + '" y1="' + s.y + '" x2="' + drag.x + '" y2="' + drag.y + '" marker-end="url(#feArrowOn)"/>');
    }

    if (!doc.nodes.length) h.push('<text class="fe-empty" x="' + W / 2 + '" y="' + H / 2 + '">빈 곳을 더블클릭하면 노드가 생깁니다</text>');

    svg.innerHTML = h.join('');
    syncSeg();
    output();
  }

  // ---------- Mermaid 코드 ----------
  function idOf(i) {   // 0 → A, 25 → Z, 26 → AA …
    var s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  function q(t) {
    t = (t || '').replace(/#(?=\w+;)/g, '#35;').replace(/"/g, '#quot;');
    return '"' + (t || ' ') + '"';
  }
  function code() {
    if (!doc.nodes.length) return '';
    var dir = radio('dir') || 'TD', lr = dir === 'LR';
    // 그린 위치 순서대로 (위→아래면 줄 단위로 위에서부터, 같은 줄은 왼쪽부터)
    var ns = doc.nodes.slice().sort(function (a, b) {
      var m = lr ? a.x - b.x : a.y - b.y, s = lr ? a.y - b.y : a.x - b.x;
      return Math.abs(m) > 20 ? m : s;
    });
    var id = {}, ord = {};
    ns.forEach(function (n, i) { id[n.id] = idOf(i); ord[n.id] = i; });
    var L = ['flowchart ' + dir];
    ns.forEach(function (n) {
      var b = SHAPES[n.s] || SHAPES.rect;
      L.push('    ' + id[n.id] + b[0] + q(n.t) + b[1]);
    });
    validEdges().sort(function (a, b) { return ord[a.a] - ord[b.a] || ord[a.b] - ord[b.b]; }).forEach(function (e) {
      L.push('    ' + id[e.a] + ' ' + (LINKS[e.k] || LINKS.arrow) + (e.t ? '|' + q(e.t) + '|' : '') + ' ' + id[e.b]);
    });
    return L.join('\n');
  }
  function output() {
    var raw = code();
    $('out').innerHTML = raw ? Portal.esc(raw) : '<span class="cm">%% 위에 그리면 여기에 Mermaid 코드가 생깁니다.</span>';
    $('out').dataset.raw = raw;
  }

  // ---------- 편집 동작 ----------
  function clampNode(n) {
    var d = dims(n);
    n.x = Math.max(snap(d.w / 2 + 10), n.x);
    n.y = Math.max(snap(d.h / 2 + 10), n.y);
  }
  function addNode(x, y, from) {
    var n;
    change(function () {
      n = { id: ++doc.seq, x: snap(x), y: snap(y), t: '노드', s: def.shape };
      clampNode(n);
      doc.nodes.push(n);
      if (from) doc.edges.push({ id: ++doc.seq, a: from, b: n.id, t: '', k: def.edge });
    });
    sel = { k: 'n', id: n.id };
    render();
    startEdit('n', n.id);
  }
  function connect(a, b) {
    for (var i = 0; i < doc.edges.length; i++) {
      if (doc.edges[i].a === a && doc.edges[i].b === b) { sel = { k: 'e', id: doc.edges[i].id }; render(); return; }
    }
    var e;
    change(function () { e = { id: ++doc.seq, a: a, b: b, t: '', k: def.edge }; doc.edges.push(e); });
    sel = { k: 'e', id: e.id };
    render();
  }
  function del() {
    if (!sel) return;
    var s = sel;
    change(function () {
      if (s.k === 'n') {
        doc.nodes = doc.nodes.filter(function (n) { return n.id !== s.id; });
        doc.edges = doc.edges.filter(function (e) { return e.a !== s.id && e.b !== s.id; });
      } else {
        doc.edges = doc.edges.filter(function (e) { return e.id !== s.id; });
      }
    });
    sel = null;
    render();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    doc = JSON.parse(undoStack.pop());
    sel = null; save(); render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    doc = JSON.parse(redoStack.pop());
    sel = null; save(); render();
  }

  // ---------- 글자 고치기 ----------
  function startEdit(k, id) {
    var o = k === 'n' ? node(id) : edge(id), cx, cy, w;
    if (!o) return;
    if (k === 'n') { var d = dims(o); cx = o.x; cy = o.y; w = Math.max(140, d.w + 20); }
    else { var g = edgeGeo(o); cx = (g.x1 + g.x2) / 2; cy = (g.y1 + g.y2) / 2; w = 140; }
    editing = { k: k, id: id };
    edit.style.left = (cx - w / 2) + 'px';
    edit.style.top = (cy - 16) + 'px';
    edit.style.width = w + 'px';
    edit.value = o.t;
    edit.style.display = 'block';
    edit.focus();
    edit.select();
  }
  function finishEdit(ok) {
    if (!editing) return;
    var ed = editing;
    editing = null;
    var v = edit.value.replace(/\s+/g, ' ').trim();
    edit.style.display = 'none';
    if (ok) change(function () { var o = ed.k === 'n' ? node(ed.id) : edge(ed.id); if (o) o.t = v; });
    svg.focus({ preventScroll: true });
  }
  edit.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
  });
  edit.addEventListener('blur', function () { finishEdit(true); });

  // ---------- 마우스 ----------
  function pt(e) { var r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  // 더블클릭은 직접 판별 (누를 때마다 다시 그려서 브라우저 dblclick이 오지 않음)
  var lastDown = null;
  document.addEventListener('pointerdown', function (e) { if (!svg.contains(e.target)) lastDown = null; }, true);
  function isDouble(p) {
    var now = Date.now(), l = lastDown;
    var dbl = !!(l && now - l.t < 450 && Math.abs(p.x - l.x) < 6 && Math.abs(p.y - l.y) < 6);
    lastDown = dbl ? null : { t: now, x: p.x, y: p.y };
    return dbl;
  }
  function onDouble(p) {
    var n = hitNode(p.x, p.y), ed;
    if (n) { sel = { k: 'n', id: n.id }; render(); startEdit('n', n.id); }
    else if ((ed = hitEdge(p.x, p.y))) { sel = { k: 'e', id: ed.id }; render(); startEdit('e', ed.id); }
    else addNode(p.x, p.y);
  }

  svg.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    finishEdit(true);
    var p = pt(e), n;
    e.preventDefault();
    if (isDouble(p)) { drag = null; onDouble(p); return; }
    if ((n = hitHandle(p.x, p.y))) {
      drag = { mode: 'link', from: n.id, sx: p.x, sy: p.y, x: p.x, y: p.y, drop: null };
    } else if ((n = hitNode(p.x, p.y))) {
      sel = { k: 'n', id: n.id };
      drag = { mode: 'move', id: n.id, dx: p.x - n.x, dy: p.y - n.y, before: snapshot(), moved: false };
    } else if ((n = hitEdge(p.x, p.y))) {
      sel = { k: 'e', id: n.id };
    } else {
      sel = null;
    }
    svg.setPointerCapture(e.pointerId);
    svg.focus({ preventScroll: true });
    render();
  });

  svg.addEventListener('pointermove', function (e) {
    var p = pt(e), n;
    if (drag && drag.mode === 'move') {
      n = node(drag.id);
      var nx = snap(p.x - drag.dx), ny = snap(p.y - drag.dy);
      if (nx !== n.x || ny !== n.y) { n.x = nx; n.y = ny; clampNode(n); drag.moved = true; render(); }
      return;
    }
    if (drag && drag.mode === 'link') {
      drag.x = p.x; drag.y = p.y;
      n = hitNode(p.x, p.y);
      drag.drop = n && n.id !== drag.from ? n.id : null;
      render();
      return;
    }
    var hh = hitHandle(p.x, p.y), hn = hh || hitNode(p.x, p.y), id = hn ? hn.id : null;
    svg.setAttribute('class', hh ? 'c-link' : hn ? 'c-move' : hitEdge(p.x, p.y) ? 'c-edge' : '');
    if (id !== hover) { hover = id; render(); }
  });

  svg.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag, p = pt(e);
    drag = null;
    if (d.mode === 'move') {
      if (d.moved && snapshot() !== d.before) push(d.before);
      render();
    } else if (d.drop) {
      connect(d.from, d.drop);
    } else if (!hitNode(p.x, p.y) && Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) > 40) {
      addNode(p.x, p.y, d.from);       // 빈 곳에 놓으면 이어진 새 노드
    } else {
      render();
    }
  });
  svg.addEventListener('pointercancel', function () { drag = null; render(); });
  svg.addEventListener('pointerleave', function () { if (!drag && hover !== null) { hover = null; render(); } });

  // ---------- 키보드 ----------
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable || (tag === 'INPUT' && t.type !== 'radio' && t.type !== 'checkbox')) return;
    var mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); }
    else if (!mod && sel && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); del(); }
    else if (!mod && sel && (k === 'Enter' || k === 'F2') && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); startEdit(sel.k, sel.id); }
  });

  // ---------- 도구 막대 ----------
  // 모양·선: 고른 노드·선이 있으면 그것만 바꾸고, 없으면 새로 그릴 기본값
  $('form').addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'shape') {
      if (sel && sel.k === 'n') { var id = sel.id; change(function () { node(id).s = t.value; }); }
      else { def.shape = t.value; Portal.store.set('def', def); }
    } else if (t.name === 'edge') {
      if (sel && sel.k === 'e') { var eid = sel.id; change(function () { edge(eid).k = t.value; }); }
      else { def.edge = t.value; Portal.store.set('def', def); }
    } else if (t.name === 'dir') {
      output();
    }
  });

  $('btnAdd').onclick = function () {
    // 보이는 영역 왼쪽 위부터 비어 있는 자리
    var x = wrap.scrollLeft + 120, y = wrap.scrollTop + 60;
    var busy = function () { return doc.nodes.some(function (n) { return Math.abs(n.x - x) < 160 && Math.abs(n.y - y) < 70; }); };
    while (busy()) y += 80;
    addNode(x, y);
  };
  $('btnDel').onclick = del;
  $('btnUndo').onclick = undo;
  $('btnClear').onclick = function () {
    if (!doc.nodes.length || !confirm('그린 내용을 모두 지울까요? (되돌리기로 살릴 수 있습니다)')) return;
    change(function () { doc.nodes = []; doc.edges = []; });
  };
  $('btnCopy').onclick = function () { Portal.copy($('out').dataset.raw || '', this); };

  // ---------- 시작 ----------
  Portal.persist($('outCard'));   // 방향만 (모양·선 기본값은 def로 따로 저장)
  window.addEventListener('resize', render);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { mcache = {}; render(); });
  render();
})();
