/*
 * 케이블 라벨 시뮬레이터 (etc/cable-label.html)
 * 엡손 LW-K460으로 케이블 라벨을 뽑기 전에 표(엑셀 붙여넣기) 한 행 = 라벨 한 장으로
 * 테이프·문자 크기(pt)·줄 나눔·길이고정(cm)을 계산해 미리보기와 본체 조작 순서를 보여준다.
 * 본체 기능 기준: LW-K460 사용설명서(활용편) — 문자 크기 38·26·19·13·10·6pt, 테두리 1~75, 표 76~79,
 *   정렬(앞모음·중모음·뒤모음·균등), 문자간격, 여백(보통·매우적음), 길이고정 1~99cm, 단락 변경.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var FONT = "Pretendard,'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
  var PTMM = 25.4 / 72;                 // 1pt = 0.3528mm
  var PTS = [38, 26, 19, 13, 10, 6];    // 본체 문자 크기
  // 테이프 폭별 최대 문자 크기(pt) = 인쇄 높이. 12mm 26pt·18mm 38pt는 엡손 FAQ, 나머지는 크기 목록에서 추정
  var HPT = { 4: 6, 6: 13, 9: 19, 12: 26, 18: 38 };
  var HPT_SURE = { 12: true, 18: true };
  var MAX_LABEL = 990;                  // 길이고정 최대 99cm
  var CELL_PAD = 0.8;                   // 표 칸 안쪽 여백(mm)
  var MARGIN = { normal: 10, min: 1 };  // 여백 보통 / 매우적음 (설명서 그림 기준 근사)
  var SPACING = { none: -0.04, narrow: 0, normal: 0.08, wide: 0.2 };   // 문자간격: 글자 크기 대비(근사)
  var SP_LABEL = { none: '없음', narrow: '좁게', normal: '보통', wide: '넓게' };
  var AL_LABEL = { left: '앞모음', center: '중모음', right: '뒤모음', justify: '균등' };
  // 설명서 부록 ‘테두리 목록’ 1~10번 (fi: 위아래 안쪽 여유, fx: 좌우 안쪽 여유, mm)
  var FRAMES = {
    0: { label: '없음' },
    1: { label: '1 사각', fi: 0.9, fx: 1.0 },
    2: { label: '2 둥근 사각', fi: 0.9, fx: 1.3 },
    3: { label: '3 점선 사각', fi: 0.9, fx: 1.0 },
    4: { label: '4 점선 둥근 사각', fi: 0.9, fx: 1.3 },
    5: { label: '5 물결 사각', fi: 1.0, fx: 1.1 },
    6: { label: '6 물결 둥근 사각', fi: 1.0, fx: 1.4 },
    7: { label: '7 사각 + 모서리 점', fi: 1.2, fx: 1.9 },
    8: { label: '8 둥근 사각 + 모서리 점', fi: 1.2, fx: 2.0 },
    9: { label: '9 화살표 →', fi: 0.9, fx: 'arrow' },
    10: { label: '10 화살표 ←', fi: 0.9, fx: 'arrow' }
  };
  var TABLES = { 76: '76 사각, 값 칸만 나눔', 77: '77 둥근 사각, 값 칸만 나눔', 78: '78 위아래 선, 값 칸만 나눔', 79: '79 바깥선 없음, 전체 칸 나눔' };

  // ── 호환 테이프 (엡손 코리아 정품 라벨테이프 일람표 중 4~18mm) ──
  var TAPES = [];
  function addT(g, code, w, bg, fg, desc, mat, len, sure, extra) {
    TAPES.push({ g: g, code: code, w: w, bg: bg, fg: fg, desc: desc, mat: mat, len: len, lenSure: sure, extra: extra || '' });
  }
  [4, 6, 9, 12, 18].forEach(function (w) { addT('백색 · 검정 글자 (SS)', 'SS' + w + 'K', w, '#ffffff', '#111111', '흰 바탕 / 검정 글자', 'PET', 9, true); });
  [6, 9, 12, 18].forEach(function (w) { addT('백색 · 빨강 글자 (SS-R)', 'SS' + w + 'R', w, '#ffffff', '#cc1f2a', '흰 바탕 / 빨강 글자', 'PET', 9, false); });
  [12, 18].forEach(function (w) { addT('백색 대용량 16m (SS-KL)', 'SS' + w + 'KL', w, '#ffffff', '#111111', '흰 바탕 / 검정 글자 · 16m', 'PET', 16, true); });
  var SC = { R: ['#f06a63', '빨강'], Y: ['#ffe04a', '노랑'], G: ['#73c476', '초록'], B: ['#69a6ea', '파랑'] };
  addT('컬러 · 검정 글자 (SC)', 'SC4Y', 4, SC.Y[0], '#111111', '노랑 바탕 / 검정 글자', 'PET', 9, true);
  [6, 9, 12, 18].forEach(function (w) { ['Y', 'R', 'G', 'B'].forEach(function (c) { addT('컬러 · 검정 글자 (SC)', 'SC' + w + c, w, SC[c][0], '#111111', SC[c][1] + ' 바탕 / 검정 글자', 'PET', 9, true); }); });
  [6, 9, 12, 18].forEach(function (w) { addT('진한 바탕 · 흰 글자 (SD)', 'SD' + w + 'K', w, '#1c1c1e', '#ffffff', '검정 바탕 / 흰 글자 (색 추정)', 'PET', 9, false); });
  [12, 18].forEach(function (w) { addT('진한 바탕 · 흰 글자 (SD)', 'SD' + w + 'B', w, '#1f5bb8', '#ffffff', '파랑 바탕 / 흰 글자 (색 추정)', 'PET', 9, false); });
  [4, 6, 9, 12, 18].forEach(function (w) { addT('투명 · 검정 글자 (ST)', 'ST' + w + 'K', w, 'clear', '#111111', '투명 바탕 / 검정 글자', 'PET', 9, false); });
  [12, 18].forEach(function (w) { addT('유연한 비닐 (SVN) · 감싸기용', 'SVN' + w + 'KW', w, '#ffffff', '#111111', '흰 바탕 / 검정 글자 · 비닐', 'Vinyl', 7, true, 'flex'); });
  [12, 18].forEach(function (w) { addT('유연한 비닐 (SVN) · 감싸기용', 'SVN' + w + 'KY', w, '#ffe04a', '#111111', '노랑 바탕 / 검정 글자 · 비닐', 'Vinyl', 7, true, 'flex'); });
  var TAPE_BY = {}; TAPES.forEach(function (t) { TAPE_BY[t.code] = t; });
  var NOT_FIT = [
    ['SVS24KW · SVS36KW', '케이블(Wrap) 비닐 24·36mm', 'LW-K460 최대 폭 18mm 초과'],
    ['SU3~SU21 (S/Y)', '열수축 튜브 Φ3~Φ21', '튜브 전용 기종용 — LW-K460 지원 폭 목록에 없음'],
    ['24·36mm 전 품목', 'SS24K, SC24·36, SVN24·36 등', 'LW-K460 최대 폭 18mm 초과']
  ];

  var TYPES = {
    text:  { label: '텍스트', br: 'word' },
    code:  { label: '코드·ID', br: '' },
    num:   { label: '숫자·용량', br: '' },
    ip:    { label: 'IP·MAC', br: '' },
    route: { label: '경로 A→B', br: 'route' }
  };
  var PLACES = { auto: '자동', start: '새 줄에서 시작', own: '한 줄 단독', join: '앞 칸에 이어서' };

  // ── 상태 (표 데이터·보기 상태는 Portal.store, 설정 칸은 Portal.persist) ──
  var S = { cols: [], rows: [], view: { mode: 'all', idx: 0, zoom: 'fit', area: true } };
  var LABELS = [], META = {};

  function sample() {
    S.cols = ['장비명', '위치', '전원', '연결', '정격'].map(function (n) { return { name: n, type: 'auto', place: 'auto', show: n !== '정격', prefix: false }; });
    var d = [
      ['WEB-SVR-01', 'R03-U12', 'PSU1', 'PDU-A 07', '10A'],
      ['WEB-SVR-01', 'R03-U12', 'PSU2', 'PDU-B 07', '10A'],
      ['DB 서버 #1', 'R03-U20', 'PSU1', 'PDU-A 08', '10A'],
      ['코어 스위치 L3-01', 'R05-U40', 'PWR-A', 'UPS2 → PDU-C 01', '16A'],
      ['스토리지 NAS-02', 'R06-U05', 'PSU1', 'PDU-D 03', '10A'],
      ['방화벽 FW-01 (이중화 주)', 'R01-U30', 'PWR1', 'PDU-A 01', '10A']
    ];
    S.rows = d.map(function (r) { return { on: true, cells: r.slice() }; });
  }
  function blankCol(i) { return { name: '열' + (i + 1), type: 'auto', place: 'auto', show: true, prefix: false }; }
  function saveData() { Portal.store.set('data', { cols: S.cols, rows: S.rows }); Portal.store.set('view', S.view); }

  // ── 설정 폼 ──
  function fillSelects() {
    var h = '', g = '';
    TAPES.forEach(function (t) {
      if (t.g !== g) { if (g) h += '</optgroup>'; g = t.g; h += '<optgroup label="' + esc(g) + '">'; }
      h += '<option value="' + t.code + '">' + t.code + '-PX · ' + t.w + 'mm · ' + esc(t.desc) + ' · ' + t.len + 'm</option>';
    });
    $('tape').innerHTML = h + '</optgroup>';
    $('tape').value = 'SS18K';
    $('frame').innerHTML = Object.keys(FRAMES).map(function (k) { return '<option value="' + k + '">' + FRAMES[k].label + '</option>'; }).join('');
    $('table').innerHTML = Object.keys(TABLES).map(function (k) { return '<option value="' + k + '">' + TABLES[k] + '</option>'; }).join('');
    var l = '<tr><th>품번</th><th>폭</th><th>색</th><th>재질 · 길이</th><th>비고</th></tr>';
    TAPES.forEach(function (t) {
      l += '<tr><td>' + t.code + '-PX</td><td>' + t.w + 'mm</td><td>' + swatch(t) + ' ' + esc(t.desc) + '</td><td>' + t.mat + ' · ' + t.len + 'm' + (t.lenSure ? '' : ' (길이 미기재→가정)') + '</td><td>' +
        (t.extra === 'flex' ? '감싸기형 권장' : t.w >= 12 ? '깃발형 추천' : '') + '</td></tr>';
    });
    NOT_FIT.forEach(function (n) { l += '<tr class="no"><td>' + n[0] + '</td><td colspan="2">' + n[1] + '</td><td colspan="2">✕ ' + n[2] + '</td></tr>'; });
    $('tapeList').innerHTML = l;
  }
  function radio(name) { var r = document.querySelector('input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function setRadio(name, v) { var r = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; }
  function num(id, def) { var v = parseFloat($(id).value); return isFinite(v) ? v : def; }
  function readOpt() {
    var t = TAPE_BY[$('tape').value] || TAPES[0];
    var hO = parseFloat($('hOver').value), mO = parseFloat($('mOver').value), wO = parseFloat($('waste').value);
    var content = radio('content') || 'auto', mg = radio('mg') || 'normal', sp = radio('sp') || 'normal';
    var frame = content === 'table' ? 0 : (+$('frame').value || 0), Fr = FRAMES[frame] || FRAMES[0];
    var H = (isFinite(hO) && hO > 0) ? Math.min(hO, t.w) : HPT[t.w] * PTMM;
    var fi = frame ? Fr.fi : 0, Hin = H - 2 * fi;
    return {
      tape: t, form: radio('form') || 'flag', content: content, dir: content === 'table' ? 'h' : (radio('dir') || 'h'),
      dia: Math.max(1, num('dia', 8)), maxText: Math.max(5, num('maxText', 40)),
      ptFix: $('ptFix').value === 'auto' ? 0 : +$('ptFix').value, minPt: +$('minPt').value || 10,
      unify: radio('unify') !== 'each', sep: $('sep').value, align: radio('align') || 'center', bold: $('bold').checked,
      sp: sp, ls: SPACING[sp], frame: frame, table: +$('table').value || 76,
      fi: fi, fx: !frame ? 0 : Fr.fx === 'arrow' ? Hin / 2 + 0.6 : Fr.fx,
      mg: mg, M: (isFinite(mO) && mO >= 0) ? mO : MARGIN[mg],
      waste: (isFinite(wO) && wO >= 0) ? wO : (mg === 'min' ? 10 : 0),
      slack: Math.max(0, num('slack', 4)), turns: Math.max(1, num('turns', 1.5)),
      H: H, Hin: Hin, Lmax: Math.max(1, Math.floor(H / (6 * PTMM) + 1e-6))
    };
  }

  // ── 글자 길이 측정 (글자 크기 1 기준) ──
  var cv = document.createElement('canvas').getContext('2d'), mCache = {};
  function chars(s) { return String(s).split(''); }
  function em(t, bold) {
    var k = (bold ? 'b' : 'n') + t;
    if (mCache[k] == null) { cv.font = (bold ? '700 ' : '500 ') + '100px ' + FONT; mCache[k] = cv.measureText(t).width / 100; }
    return mCache[k];
  }
  var CJK = /[ᄀ-ᇿ㄰-㆏가-힯一-鿿　-〿＀-￯]/;
  function vAdv(ch) { return ch === ' ' ? 0.5 : CJK.test(ch) ? 1 : 0.8; }   // 세로쓰기: 글자를 쌓는 칸 높이
  function meas(t, O) {
    var cs = chars(t), base = 0;
    if (O.dir === 'v') cs.forEach(function (c) { base += vAdv(c); });
    else base = em(t, O.bold);
    return base + O.ls * Math.max(0, cs.length - 1);
  }
  // k줄·글 길이(em)에 맞는 가장 큰 본체 문자 크기. 줄은 문자 크기 그대로 쌓임(38pt 1줄 = 19pt 2줄 = 6pt 6줄)
  function pickPt(k, wEm, O, avail, Hin) {
    var list = O.ptFix ? [O.ptFix] : PTS;
    for (var i = 0; i < list.length; i++) {
      var f = list[i] * PTMM;
      if (k * f <= Hin + 0.01 && wEm * f <= avail + 0.01) return { pt: list[i], ok: true };
    }
    var fitH = list.filter(function (p) { return k * p * PTMM <= Hin + 0.01; });
    if (fitH.length) return { pt: fitH[fitH.length - 1], ok: false, why: 'w' };
    return { pt: list[list.length - 1], ok: false, why: 'h' };
  }

  // ── 유형 자동 판단 ──
  var RX = {
    ip: /^((\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?|([0-9a-f]{2}[:-]){5}[0-9a-f]{2})$/i,
    route: /(→|->|=>|⇒|>|~)/,
    num: /^[-+]?\d[\d,.]*\s*[a-zA-Z%가-힣]{0,3}$/,
    code: /^\S{1,16}$/
  };
  function typeOfValue(v) {
    if (RX.ip.test(v)) return 'ip';
    if (RX.route.test(v)) return 'route';
    if (RX.num.test(v)) return 'num';
    if (RX.code.test(v)) return 'code';
    return 'text';
  }
  function detectType(ci) {
    var vs = S.rows.map(function (r) { return (r.cells[ci] || '').trim(); }).filter(Boolean);
    if (!vs.length) return 'text';
    var ts = vs.map(typeOfValue), all = function (x) { return ts.every(function (t) { return t === x; }); };
    if (all('ip')) return 'ip';
    if (all('num')) return 'num';
    if (ts.indexOf('route') >= 0) return 'route';
    if (ts.every(function (t) { return t === 'code' || t === 'num' || t === 'ip'; })) return 'code';
    return 'text';
  }
  var DET = [];
  function effType(ci) { var c = S.cols[ci]; return c.type === 'auto' ? DET[ci] : c.type; }
  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }

  // ── 레이아웃 엔진 (자동 줄맞춤) ──
  // 한 행 → 항목(열 값) → 원자(줄바꿈 단위). 원자 사이 경계마다 줄을 나눌 수 있는지 판단해
  // 줄 수 k(1..최대)별로 가능한 분할을 모두 따져 본체 문자 크기(pt)가 가장 크게(같으면 짧게) 나오는 배치를 고른다.
  function itemsOf(row) {
    var items = [];
    S.cols.forEach(function (c, ci) {
      if (!c.show) return;
      var v = clean(row.cells[ci]);
      if (!v) return;
      if (c.prefix && c.name.trim()) v = c.name.trim() + ' ' + v;
      items.push({ ci: ci, text: v, type: effType(ci), place: c.place || 'auto' });
    });
    return items;
  }
  function splitRoute(t) {
    var p = t.split(/\s*(→|->|=>|⇒|>|~)\s*/), out = [];
    if (p[0]) out.push({ t: p[0], join: '' });
    for (var i = 1; i < p.length; i += 2) out.push({ t: p[i] + ' ' + (p[i + 1] || ''), join: ' ' });
    if (!out.length) out.push({ t: t, join: '' });
    out[0].join = '';
    return out;
  }
  function chunk(p, maxEm, O) {
    var out = [], cur = '';
    chars(p.t).forEach(function (ch) {
      if (cur && meas(cur + ch, O) > maxEm) { out.push(cur); cur = ''; }
      cur += ch;
    });
    if (cur) out.push(cur);
    return out.map(function (t, i) { return { t: t, join: i ? '' : p.join }; });
  }
  function atomsOf(items, O, avail) {
    var atoms = [], maxEm = avail / (6 * PTMM);
    items.forEach(function (it, j) {
      var br = TYPES[it.type].br, parts;
      if (br === 'word') parts = it.text.split(' ').map(function (w, i) { return { t: w, join: i ? ' ' : '' }; });
      else if (br === 'route') parts = splitRoute(it.text);
      else parts = [{ t: it.text, join: '' }];
      if (br) parts = [].concat.apply([], parts.map(function (p) { return meas(p.t, O) > maxEm ? chunk(p, maxEm, O) : [p]; }));
      parts.forEach(function (p, i) { atoms.push({ t: p.t, join: p.join, item: j, first: i === 0 }); });
    });
    return atoms;
  }
  function boundaries(atoms, items) {
    var b = [];
    for (var i = 1; i < atoms.length; i++) {
      var a = atoms[i];
      if (!a.first) { b[i] = 'inner'; continue; }
      var cur = items[a.item].place, prev = items[a.item - 1].place;
      if (cur === 'start' || cur === 'own' || prev === 'own') b[i] = 'forced';
      else if (cur === 'join') b[i] = 'forbid';
      else b[i] = 'item';
    }
    return b;
  }
  function lineText(atoms, from, to, sep) {
    var s = '';
    for (var i = from; i < to; i++) s += (i === from ? '' : (atoms[i].first ? sep : atoms[i].join)) + atoms[i].t;
    return s;
  }
  function eachPartition(atoms, b, k, fn) {
    var forced = [], opt = [];
    for (var i = 1; i < atoms.length; i++) { if (b[i] === 'forced') forced.push(i); else if (b[i] !== 'forbid') opt.push(i); }
    var r = k - 1 - forced.length;
    if (r < 0 || r > opt.length) return;
    var count = 0, pick = [];
    (function rec(start) {
      if (count > 20000) return;
      if (pick.length === r) { count++; fn(forced.concat(pick).sort(function (x, y) { return x - y; })); return; }
      for (var i = start; i <= opt.length - (r - pick.length); i++) { pick.push(opt[i]); rec(i + 1); pick.pop(); }
    })(0);
  }
  function candidates(items, O, avail) {
    var atoms = atomsOf(items, O, avail), b = boundaries(atoms, items), out = [];
    var kMin = 1; for (var i = 1; i < atoms.length; i++) if (b[i] === 'forced') kMin++;
    var kMax = Math.max(kMin, Math.min(O.Lmax, atoms.length));
    for (var k = kMin; k <= kMax; k++) {
      eachPartition(atoms, b, k, function (br) {
        var cuts = [0].concat(br, [atoms.length]), lines = [], maxEm = 0, inner = 0;
        for (var i = 0; i < cuts.length - 1; i++) {
          var t = lineText(atoms, cuts[i], cuts[i + 1], O.sep);
          lines.push(t); maxEm = Math.max(maxEm, meas(t, O));
        }
        br.forEach(function (x) { if (b[x] === 'inner') inner++; });
        var p = pickPt(k, maxEm, O, avail, O.Hin);
        out.push({ k: k, lines: lines, maxEm: maxEm, inner: inner, pt: p.pt, ok: p.ok, why: p.why, len: maxEm * p.pt * PTMM });
      });
    }
    return out;
  }
  function better(a, b) {   // 안 넘침 > 큰 pt > 단어 안 쪼갬 > 짧게 > 줄 적게
    if (a.ok !== b.ok) return a.ok;
    if (a.pt !== b.pt) return a.pt > b.pt;
    if (a.inner !== b.inner) return a.inner < b.inner;
    if (Math.abs(a.len - b.len) > 0.5) return a.len < b.len;
    return a.k < b.k;
  }
  function bestOf(cands) { var best = null; cands.forEach(function (c) { if (!best || better(c, best)) best = c; }); return best; }
  // 문자 크기 P 고정: limit(글 길이 상한)이 없으면 가장 짧게, 있으면 그 안에서 줄 수가 가장 적게
  function bestAtPt(cands, P, O, avail, limit, allowOver) {
    var best = null, bl = 0, f = P * PTMM;
    cands.forEach(function (c) {
      if (c.k * f > O.Hin + 0.01) return;
      var len = c.maxEm * f;
      if (!allowOver && len > avail + 0.01) return;
      if (limit && len > limit + 0.01) return;
      var bt = !best || c.inner < best.inner || (c.inner === best.inner && (limit
        ? (c.k < best.k || (c.k === best.k && len < bl))
        : (len < bl - 0.5 || (Math.abs(len - bl) <= 0.5 && c.k < best.k))));
      if (bt) { best = c; bl = len; }
    });
    return best;
  }

  // ── 표 라벨 (1단락 항목명 | 2단락 값, 인쇄할 열마다 한 행) ──
  function tableItems(row) {
    var items = [];
    S.cols.forEach(function (c, ci) {
      if (!c.show) return;
      items.push({ ci: ci, name: clean(c.name) || ('열' + (ci + 1)), value: clean(row.cells[ci]) });
    });
    return items;
  }

  function cm(mm) { return Math.max(1, Math.ceil(mm / 10 - 1e-9)); }
  function compute() {
    var O = readOpt(), C = Math.PI * O.dia;
    O.circ = C;
    var pads = 2 * O.fx;
    var avail = Math.max(3, (O.form === 'wrap' ? C - O.M - 1 : O.maxText) - pads);
    DET = S.cols.map(function (c, ci) { return detectType(ci); });
    var labs = [], P = Infinity, Pby = -1;

    if (O.content === 'table') {
      var HinT = O.H - 0.6, availT = avail - 4 * CELL_PAD;
      S.rows.forEach(function (row, ri) {
        if (!row.on) return;
        var items = tableItems(row);
        if (!items.length || items.every(function (it) { return !it.value; })) return;
        var c1 = 0, c2 = 0;
        items.forEach(function (it) { c1 = Math.max(c1, meas(it.name, O)); c2 = Math.max(c2, meas(it.value, O)); });
        labs.push({ kind: 'table', ri: ri, items: items, c1: c1, c2: c2, k: items.length });
      });
      var c1m = 0, c2m = 0;
      labs.forEach(function (L) { c1m = Math.max(c1m, L.c1); c2m = Math.max(c2m, L.c2); });
      labs.forEach(function (L) {
        if (O.unify) { L.c1 = c1m; L.c2 = c2m; }
        var p = pickPt(L.k, L.c1 + L.c2, O, availT, HinT);
        L.pt = p.pt; L.ok = p.ok; L.why = p.why;
        if (L.pt < P) { P = L.pt; Pby = L.ri; }
      });
      labs.forEach(function (L) {
        if (O.unify) L.pt = P;
        L.f = L.pt * PTMM;
        L.tw = L.f * (L.c1 + L.c2) + 4 * CELL_PAD;
        L.bw = L.tw;
      });
    } else {
      S.rows.forEach(function (row, ri) {
        if (!row.on) return;
        var items = itemsOf(row);
        if (!items.length) return;
        var cands = candidates(items, O, avail);
        labs.push({ kind: 'text', ri: ri, items: items, cands: cands, best: bestOf(cands) });
      });
      labs.forEach(function (L) { if (L.best.pt < P) { P = L.best.pt; Pby = L.ri; } });
      // 통일: ① 모두 같은 크기 P에서 가장 짧은 글 길이 → 공통 길이 Lc ② Lc 안에서 줄 수가 가장 적은 배치로 다시 고름
      var Lc = 0;
      if (O.unify) labs.forEach(function (L) { var c = bestAtPt(L.cands, P, O, avail, 0, !L.best.ok); if (c) Lc = Math.max(Lc, c.maxEm * P * PTMM); });
      labs.forEach(function (L) {
        var c = L.best, pt = c.pt;
        if (O.unify) { var c2 = bestAtPt(L.cands, P, O, avail, Lc, !L.best.ok) || bestAtPt(L.cands, P, O, avail, 0, true); if (c2) { c = c2; pt = P; } }
        L.pt = pt; L.f = pt * PTMM; L.k = c.k; L.lines = c.lines;
        L.ok = c.ok || (c.maxEm * L.f <= avail + 0.01 && c.k * L.f <= O.Hin + 0.01); L.why = c.why;
        L.tw = O.unify ? Lc : c.maxEm * L.f;
        L.bw = L.tw + pads;
      });
    }
    labs.forEach(function (L) { geom(L, O); L.warn = warnOf(L, O); });
    META = { O: O, circ: C, P: P, Pby: Pby, avail: avail };
    return labs;
  }

  // 라벨 길이·글 블록·테두리 위치 (본체 동작: [여백][인쇄 범위][여백], 길이고정은 cm 단위)
  function geom(L, O) {
    var M = O.M, C = O.circ, bw = L.bw;
    L.fixed = null; L.gap = 0; L.hidden = 0; L.zone = null;
    if (O.form === 'flag') {
      if (L.kind === 'table') {
        // 표는 1·2단락을 쓰므로: 자동컷트 끄고 표 인쇄 → 길이지정으로 빈 테이프 전송 → 같은 표 인쇄
        L.gap = Math.ceil(Math.max(0, C + O.slack - 2 * M));
        L.total = 2 * (2 * M + bw) + L.gap;
        L.blocks = [{ x: M, w: bw }, { x: 3 * M + bw + L.gap, w: bw }];
      } else {
        // 1단락·2단락에 같은 내용 + 길이고정 + 균등 → 양 끝에 인쇄 (설명서 ‘라벨 길이 설정’ 예시)
        L.fixed = cm(2 * (M + bw) + C + O.slack);
        L.total = L.fixed * 10;
        L.blocks = [{ x: M, w: bw }, { x: L.total - M - bw, w: bw }];
      }
      L.zone = [L.total / 2 - C / 2, L.total / 2 + C / 2];
      L.frames = L.blocks.map(function (b) { return [b.x, b.w]; });
    } else if (O.form === 'wrap') {
      // 길이고정 + 뒤모음 → 글이 끝쪽(바깥 겹)에 옴
      L.fixed = cm(C * O.turns);
      L.total = L.fixed * 10;
      L.hidden = Math.max(0, L.total - C);
      L.blocks = [{ x: L.total - M - bw, w: bw }];
      L.frames = [[M, L.total - 2 * M]];
    } else {
      if (O.unify) { L.fixed = cm(2 * M + bw); L.total = L.fixed * 10; }
      else L.total = 2 * M + bw;
      var pr = L.total - 2 * M;
      if (O.align === 'justify' && L.kind === 'text' && L.fixed) L.blocks = [{ x: M, w: pr }];
      else {
        var x = O.align === 'left' ? M : O.align === 'right' ? L.total - M - bw : M + (pr - bw) / 2;
        L.blocks = [{ x: x, w: bw }];
      }
      L.frames = [[M, pr]];     // 테두리는 라벨(인쇄 범위) 전체를 감쌈
    }
  }
  function warnOf(L, O) {
    var w = [];
    if (L.k > O.Lmax) w.push((L.kind === 'table' ? '표 행수 초과: ' : '행수 초과: ') + L.k + '줄 (이 테이프 최대 ' + O.Lmax + '줄) — ' + (L.kind === 'table' ? '인쇄할 열을 줄이세요' : '배치 설정을 줄이세요'));
    else if (!L.ok && L.why === 'h') w.push(L.k + '줄이 ' + (O.frame ? '테두리 안에' : '테이프에') + ' ' + L.pt + 'pt로 들어가지 않음');
    if (!L.ok && L.why === 'w') w.push((O.ptFix ? '지정한 ' + L.pt + 'pt로는' : '가장 작은 ' + L.pt + 'pt로도') + ' 글씨 최대 길이를 넘음 — 최대 길이를 늘리거나 열을 줄이세요');
    if (L.pt < O.minPt) w.push('문자 크기 ' + L.pt + 'pt — 작아서 읽기 어려울 수 있음');
    if (L.total > MAX_LABEL) w.push('라벨 길이 ' + f1(L.total) + 'mm — 본체 최대 99cm 초과');
    if (O.form === 'wrap' && L.bw > O.circ - O.M + 0.01) w.push('글이 보이는 한 바퀴(' + f1(O.circ) + 'mm)보다 김 — 여백 매우적음 또는 깃발형 권장');
    return w;
  }

  // ── SVG 그리기 (단위 mm, 테이프·글자색은 실제 테이프 색) ──
  var uid = 0;
  function swatch(t) {
    var bg = t.bg === 'clear' ? 'repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/8px 8px' : t.bg;
    return '<span class="cl-swatch" style="background:' + bg + ';color:' + t.fg + '">가A</span>';
  }
  // 글자는 20배 좌표계에서 그린 뒤 축소: 아주 작은 font-size(수 mm)를 그대로 쓰면 브라우저가 글자 폭을 반올림해 실제보다 넓게 그림
  function txt(x, y, s, f, O, fill, o) {
    var K = 20; o = o || {};
    return '<text transform="scale(0.05)" x="' + r2(x * K) + '" y="' + r2(y * K) + '" font-size="' + r2(f * K) + '" dominant-baseline="central" font-family="' + FONT.replace(/"/g, '') +
      '" font-weight="' + (O.bold ? 700 : 500) + '" fill="' + fill + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.ls ? ' letter-spacing="' + r2(o.ls * K) + '"' : '') +
      (o.tl ? ' textLength="' + r2(o.tl * K) + '" lengthAdjust="spacing"' : '') + '>' + esc(s) + '</text>';
  }
  // 둥근(또는 각진) 사각형 둘레를 따라 물결 경로
  function wavyPath(x, y, w, h, r) {
    var pts = [], step = 0.12, amp = 0.22, lam = 1.4, P = 2 * (w + h - 4 * r) + 2 * Math.PI * r, s;
    var q = Math.PI * r / 2;
    var segs = [[w - 2 * r, 'top'], [q, 'c1'], [h - 2 * r, 'right'], [q, 'c2'], [w - 2 * r, 'bottom'], [q, 'c3'], [h - 2 * r, 'left'], [q, 'c4']];
    var BASE = { c1: -Math.PI / 2, c2: 0, c3: Math.PI / 2, c4: Math.PI };
    function at(d) {
      for (var i = 0; i < segs.length; i++) {
        var len = segs[i][0], n = segs[i][1];
        if (d <= len || i === segs.length - 1) {
          if (n === 'top') return [x + r + d, y, 0, -1];
          if (n === 'right') return [x + w, y + r + d, 1, 0];
          if (n === 'bottom') return [x + w - r - d, y + h, 0, 1];
          if (n === 'left') return [x, y + h - r - d, -1, 0];
          var cx = (n === 'c1' || n === 'c2') ? x + w - r : x + r, cy = (n === 'c1' || n === 'c4') ? y + r : y + h - r;
          var a = BASE[n] + (r ? d / r : 0);
          return [cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)];
        }
        d -= len;
      }
    }
    for (s = 0; s <= P; s += step) {
      var p = at(s), o = amp * Math.sin(2 * Math.PI * s / lam);
      pts.push(r2(p[0] + p[2] * o) + ',' + r2(p[1] + p[3] * o));
    }
    return 'M' + pts.join(' L') + ' Z';
  }
  function drawFrame(x0, w, O, fg) {
    var W = O.tape.w, y = (W - O.H) / 2 + 0.25, h = O.H - 0.5, x = x0 + 0.25, ww = w - 0.5, s = '', fr = O.frame;
    var rr = Math.min(1.8, h / 4);
    var rect = function (rx, sw, dash) { return '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(ww) + '" height="' + r2(h) + '" rx="' + rx + '" fill="none" stroke="' + fg + '" stroke-width="' + sw + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; };
    if (fr === 1) s = rect(0, 0.3);
    else if (fr === 2) s = rect(r2(rr), 0.45);
    else if (fr === 3) s = rect(0, 0.35, '0.9 0.6');
    else if (fr === 4) s = rect(r2(rr), 0.35, '0.9 0.6');
    else if (fr === 5 || fr === 6) s = '<path d="' + wavyPath(x + 0.2, y + 0.2, ww - 0.4, h - 0.4, fr === 6 ? rr : 0) + '" fill="none" stroke="' + fg + '" stroke-width="0.22"/>';
    else if (fr === 7 || fr === 8) {
      s = rect(fr === 8 ? r2(rr) : 0, 0.55);
      [[x + 0.9, y + 0.9], [x + ww - 0.9, y + 0.9], [x + 0.9, y + h - 0.9], [x + ww - 0.9, y + h - 0.9]].forEach(function (p) { s += '<circle cx="' + r2(p[0]) + '" cy="' + r2(p[1]) + '" r="0.32" fill="' + fg + '"/>'; });
    } else if (fr === 9 || fr === 10) {
      var t = h / 2, ym = y + h / 2, a = x, b = x + ww, pts;
      pts = fr === 9 ? [[a, y], [b - t, y], [b, ym], [b - t, y + h], [a, y + h], [a + t, ym]]
                     : [[a + t, y], [b, y], [b - t, ym], [b, y + h], [a + t, y + h], [a, ym]];
      s = '<polygon points="' + pts.map(function (p) { return r2(p[0]) + ',' + r2(p[1]); }).join(' ') + '" fill="none" stroke="' + fg + '" stroke-width="0.35" stroke-linejoin="round"/>';
    }
    return s;
  }
  // 자동 줄맞춤 글 블록 (가로쓰기/세로쓰기, 정렬, 문자간격)
  function drawText(L, x0, w, O, fg) {
    var f = L.f, W = O.tape.w, k = L.lines.length, ls = O.ls * f, s = '';
    var bh = f * k, ix = x0 + O.fx, iw = w - 2 * O.fx;
    if (O.dir === 'v') {
      // 세로쓰기: 테이프를 세워(시작 끝이 위) 읽는 방향, 첫 줄이 오른쪽(테이프 위쪽 가장자리)
      s += '<g transform="matrix(0,-1,1,0,' + r2(ix) + ',' + W + ')">';
      L.lines.forEach(function (t, i) {
        var X = W / 2 + bh / 2 - f / 2 - i * f, cs = chars(t), nat = meas(t, O) * f;
        var y = O.align === 'right' ? iw - nat : O.align === 'center' ? (iw - nat) / 2 : 0;
        var extra = (O.align === 'justify' && cs.length > 1) ? (iw - nat) / (cs.length - 1) : 0;
        if (O.align === 'justify' && cs.length <= 1) y = (iw - nat) / 2;
        cs.forEach(function (ch) {
          var a = vAdv(ch) * f;
          if (ch !== ' ') s += txt(X, y + a / 2, ch, f * 0.92, O, fg, { anchor: 'middle' });
          y += a + ls + extra;
        });
      });
      return s + '</g>';
    }
    var top = W / 2 - bh / 2;
    L.lines.forEach(function (t, i) {
      var y = top + f * (i + 0.5), lw = meas(t, O) * f, x;
      if (O.align === 'justify' && chars(t).length > 1) { s += txt(ix, y, t, f, O, fg, { tl: iw }); return; }
      x = O.align === 'left' ? ix : O.align === 'right' ? ix + iw - lw : ix + (iw - lw) / 2;
      s += txt(x, y, t, f, O, fg, { ls: ls });
    });
    return s;
  }
  // 표 76~79 (설명서 부록 그림 기준)
  function drawTable(L, x0, O, fg) {
    var W = O.tape.w, y0 = (W - O.H) / 2 + 0.3, h = O.H - 0.6, k = L.items.length, rh = h / k, f = L.f, ls = O.ls * f;
    var c1w = f * L.c1 + 2 * CELL_PAD, tw = L.tw, xa = x0 + 0.2, xb = x0 + tw - 0.2, xd = x0 + c1w, s = '', T = O.table;
    var line = function (x1, y1, x2, y2, sw) { return '<line x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '" stroke="' + fg + '" stroke-width="' + sw + '"/>'; };
    if (T === 76 || T === 77) s += '<rect x="' + r2(xa) + '" y="' + r2(y0) + '" width="' + r2(xb - xa) + '" height="' + r2(h) + '" rx="' + (T === 77 ? r2(Math.min(1.8, h / 4)) : 0) + '" fill="none" stroke="' + fg + '" stroke-width="0.3"/>';
    if (T === 78) s += line(xa, y0, xb, y0, 0.35) + line(xa, y0 + h, xb, y0 + h, 0.35);
    s += line(xd, y0, xd, y0 + h, 0.25);
    for (var i = 1; i < k; i++) s += line(T === 79 ? xa : xd, y0 + rh * i, xb, y0 + rh * i, 0.2);
    L.items.forEach(function (it, i) {
      var y = y0 + rh * (i + 0.5);
      s += txt(x0 + (c1w - meas(it.name, O) * f) / 2, y, it.name, f, O, fg, { ls: ls });
      if (!it.value) return;
      var vw = meas(it.value, O) * f, a = xd + CELL_PAD, b = x0 + tw - CELL_PAD, x;
      if (O.align === 'justify' && chars(it.value).length > 1) { s += txt(a, y, it.value, f, O, fg, { tl: b - a }); return; }
      x = O.align === 'right' ? b - vw : O.align === 'center' ? a + (b - a - vw) / 2 : a;
      s += txt(x, y, it.value, f, O, fg, { ls: ls });
    });
    return s;
  }
  function svgLabel(L, scale, opt) {
    var O = META.O, T = O.tape, W = T.w, tot = L.total, id = 'clg' + (++uid), rulerH = opt.ruler ? 6 : 0;
    var vbW = tot + 1, vbH = W + 1 + rulerH, s = '';
    s += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 ' + r2(vbW) + ' ' + r2(vbH) + '" width="' + Math.round(vbW * scale) + '" height="' + Math.round(vbH * scale) + '">';
    s += '<defs><pattern id="h' + id + '" patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.6" stroke="#888" stroke-width="0.35" opacity=".45"/></pattern>' +
      '<pattern id="c' + id + '" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="2" height="2" fill="#f4f4f4"/><rect width="1" height="1" fill="#dedede"/><rect x="1" y="1" width="1" height="1" fill="#dedede"/></pattern></defs>';
    s += '<rect x="0" y="0" width="' + r2(tot) + '" height="' + W + '" rx="0.5" fill="' + (T.bg === 'clear' ? 'url(#c' + id + ')' : T.bg) + '" stroke="#00000055" stroke-width="0.2"/>';
    var dash = function (x) { return '<line x1="' + r2(x) + '" y1="0" x2="' + r2(x) + '" y2="' + W + '" stroke="#555" stroke-width="0.2" stroke-dasharray="0.7 0.5"/>'; };
    var cap = function (x, t) { return '<text transform="scale(0.05)" x="' + r2(x * 20) + '" y="' + r2(W * 10) + '" font-size="34" text-anchor="middle" dominant-baseline="central" fill="#666" font-family="sans-serif">' + t + '</text>'; };
    if (opt.area) {
      var areas = (O.form === 'flag' && L.kind === 'table') ? L.blocks.map(function (bk) { return [bk.x, bk.w]; }) : [[O.M, Math.max(0, tot - 2 * O.M)]];
      areas.forEach(function (ar) {
        s += '<rect x="' + r2(ar[0]) + '" y="' + r2((W - O.H) / 2) + '" width="' + r2(ar[1]) + '" height="' + r2(O.H) + '" fill="none" style="stroke:var(--accent)" stroke-width="0.15" stroke-dasharray="0.8 0.6" opacity=".8"/>';
      });
    }
    if (L.zone) {
      var zw = L.zone[1] - L.zone[0];
      s += '<rect x="' + r2(L.zone[0]) + '" y="0" width="' + r2(zw) + '" height="' + W + '" fill="url(#h' + id + ')"/>' + dash(L.zone[0]) + dash(L.zone[1]);
      if (zw >= 14 && W >= 9) s += cap(L.total / 2, '케이블 Ø' + O.dia + ' 감기');
    }
    if (L.hidden > 0.3) {
      s += '<rect x="0" y="0" width="' + r2(L.hidden) + '" height="' + W + '" fill="url(#h' + id + ')"/>' + dash(L.hidden);
      if (L.hidden >= 10 && W >= 9) s += cap(L.hidden / 2, '겹쳐 가려짐');
    }
    if (L.kind === 'text' && O.frame) L.frames.forEach(function (fr) { s += drawFrame(fr[0], fr[1], O, T.fg); });
    L.blocks.forEach(function (b) { s += L.kind === 'table' ? drawTable(L, b.x, O, T.fg) : drawText(L, b.x, b.w, O, T.fg); });
    if (O.mg === 'min') {
      // 여백 매우적음: 커트 마크가 찍힘
      [0, tot].forEach(function (x) {
        s += '<line x1="' + r2(x) + '" y1="0" x2="' + r2(x) + '" y2="1.6" stroke="' + T.fg + '" stroke-width="0.25"/><line x1="' + r2(x) + '" y1="' + r2(W - 1.6) + '" x2="' + r2(x) + '" y2="' + W + '" stroke="' + T.fg + '" stroke-width="0.25"/>';
      });
    }
    if (opt.ruler) {
      var ry = W + 1.2;
      s += '<line x1="0" y1="' + ry + '" x2="' + r2(tot) + '" y2="' + ry + '" stroke="currentColor" stroke-width="0.12"/>';
      for (var m = 0; m <= tot + 0.01; m++) {
        var hh = m % 10 === 0 ? 1.6 : m % 5 === 0 ? 1.1 : 0.6;
        s += '<line x1="' + m + '" y1="' + ry + '" x2="' + m + '" y2="' + r2(ry + hh) + '" stroke="currentColor" stroke-width="0.1"/>';
        if (m % 10 === 0 && m > 0) s += '<text transform="scale(0.05)" x="' + (m * 20) + '" y="' + r2((ry + 3.3) * 20) + '" font-size="34" text-anchor="middle" fill="currentColor" font-family="sans-serif">' + m + '</text>';
      }
    }
    return s + '</svg>';
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function key(k) { return '<span class="cl-key">' + k + '</span>'; }

  // ── 입력 표 ──
  function typeOpts(ci) {
    var c = S.cols[ci], h = '<option value="auto">자동 (' + TYPES[DET[ci] || 'text'].label + ')</option>';
    Object.keys(TYPES).forEach(function (k) { h += '<option value="' + k + '"' + (c.type === k ? ' selected' : '') + '>' + TYPES[k].label + '</option>'; });
    return h;
  }
  function placeOpts(ci) {
    var c = S.cols[ci], h = '';
    Object.keys(PLACES).forEach(function (k) { h += '<option value="' + k + '"' + (c.place === k ? ' selected' : '') + '>' + PLACES[k] + '</option>'; });
    return h;
  }
  function renderTable() {
    DET = S.cols.map(function (c, ci) { return detectType(ci); });
    var h = '<thead><tr class="hd"><th class="rn">#</th>';
    S.cols.forEach(function (c, ci) {
      h += '<th><div class="cl-hcell"><input class="hname" data-h="' + ci + '" value="' + esc(c.name) + '" placeholder="열 이름"><button type="button" class="cl-x" data-delcol="' + ci + '" title="열 삭제">×</button></div></th>';
    });
    h += '<th class="cl-addc" rowspan="4"></th></tr>';
    h += '<tr class="cf1"><th class="rn">유형</th>' + S.cols.map(function (c, ci) { return '<th><select data-cf="type" data-c="' + ci + '">' + typeOpts(ci) + '</select></th>'; }).join('') + '</tr>';
    h += '<tr class="cf2"><th class="rn">배치</th>' + S.cols.map(function (c, ci) { return '<th><select data-cf="place" data-c="' + ci + '">' + placeOpts(ci) + '</select></th>'; }).join('') + '</tr>';
    h += '<tr class="cf3"><th class="rn">표시</th>' + S.cols.map(function (c, ci) {
      return '<th><label class="check"><input type="checkbox" data-cf="show" data-c="' + ci + '"' + (c.show ? ' checked' : '') + '>인쇄</label>' +
        '<label class="check pfx" title="값 앞에 열 이름을 붙임 (예: PDU A-07)"><input type="checkbox" data-cf="prefix" data-c="' + ci + '"' + (c.prefix ? ' checked' : '') + '>열 이름 붙이기</label></th>';
    }).join('') + '</tr></thead><tbody>';
    S.rows.forEach(function (r, ri) {
      h += '<tr' + (r.on ? '' : ' class="off"') + '><td class="rn"><div class="cl-rcell"><label class="check" title="출력 대상"><input type="checkbox" data-on="' + ri + '"' + (r.on ? ' checked' : '') + '>' + (ri + 1) + '</label>' +
        '<button type="button" class="cl-x" data-delrow="' + ri + '" title="행 삭제">×</button></div></td>';
      S.cols.forEach(function (c, ci) { h += '<td><input type="text" data-r="' + ri + '" data-c="' + ci + '" value="' + esc(r.cells[ci] || '') + '"></td>'; });
      h += '<td></td></tr>';
    });
    $('clGrid').innerHTML = h + '</tbody>';
    // 머리 4줄 고정(sticky) 위치를 실제 높이로 맞춤
    var top = 0;
    [].forEach.call($('clGrid').tHead.rows, function (tr) {
      [].forEach.call(tr.cells, function (th) { th.style.top = top + 'px'; });
      top += tr.offsetHeight;
    });
  }
  function refreshDetected() {
    S.cols.forEach(function (c, ci) {
      var sel = document.querySelector('#clGrid select[data-cf="type"][data-c="' + ci + '"]');
      if (sel) sel.options[0].textContent = '자동 (' + TYPES[DET[ci] || 'text'].label + ')';
    });
  }
  function addRow() { S.rows.push({ on: true, cells: S.cols.map(function () { return ''; }) }); }
  function addCol() { S.cols.push(blankCol(S.cols.length)); S.rows.forEach(function (r) { r.cells.push(''); }); }

  // 엑셀 붙여넣기 (TSV, 따옴표 셀 처리)
  function parseTSV(text) {
    text = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    var rows = [[]], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { rows[rows.length - 1].push(cell); cell = ''; }
      else if (ch === '\n') { rows[rows.length - 1].push(cell); rows.push([]); cell = ''; }
      else cell += ch;
    }
    rows[rows.length - 1].push(cell);
    return rows.map(function (r) { return r.map(function (c) { return c.replace(/\n/g, ' ').trim(); }); });
  }
  function onPaste(e) {
    var t = e.target, raw = (e.clipboardData || window.clipboardData).getData('text');
    if (!raw || !/[\t\n]/.test(raw.replace(/\s+$/, ''))) return;
    var isH = t.hasAttribute('data-h'), isC = t.hasAttribute('data-r');
    if (!isH && !isC) return;
    e.preventDefault();
    var data = parseTSV(raw), c0 = +(isH ? t.getAttribute('data-h') : t.getAttribute('data-c'));
    var width = Math.max.apply(null, data.map(function (r) { return r.length; }));
    var r0 = 0;
    if (isH) {
      // 첫 열 머리글에 붙이면 표 전체를 새로 채움, 중간 열이면 그 열부터 덮어씀
      if (c0 === 0) { S.cols = []; S.rows = []; }
      while (S.cols.length < c0 + width) addCol();
      data.shift().forEach(function (v, j) { S.cols[c0 + j].name = v || ('열' + (c0 + j + 1)); });
    } else {
      while (S.cols.length < c0 + width) addCol();
      r0 = +t.getAttribute('data-r');
    }
    data.forEach(function (r, i) {
      while (S.rows.length <= r0 + i) addRow();
      r.forEach(function (v, j) { S.rows[r0 + i].cells[c0 + j] = v; });
    });
    if (!S.rows.length) addRow();
    renderTable(); update(true);
  }

  // ── 본체 설정 순서 (조작 순서대로) ──
  function stepsOf(L) {
    var O = META.O, T = O.tape, isT = L.kind === 'table', ED = key('편집'), OK = key('선택/줄변경'), BR = key('단락 변경'), st = [];
    var add = function (id, t, v, how, sig) { st.push({ id: id, t: t, v: v, how: how || '', sig: String(sig) }); };
    add('tape', '테이프', T.code + '-PX <span class="cl-sub">' + T.w + 'mm · ' + esc(T.desc) + '</span>', '', T.code);
    if (!isT) add('dir', '인쇄방향', O.dir === 'v' ? '<b>세로쓰기</b>' : '가로쓰기', '인쇄방향 키를 누를 때마다 가로쓰기 ↔ 세로쓰기', O.dir);
    if (isT) add('table', '표 선택', '<b>표 ' + O.table + '번</b>', ED + ' → 테두리·표 → ' + O.table + ' → 문장전체', O.table);
    var inp, inpHow, inpSig;
    if (isT) { inp = '1단락 항목명 ' + L.k + '줄 → 2단락 값 ' + L.k + '줄'; inpHow = '줄바꿈 ' + OK + ' · 1단락을 다 쓰고 ' + BR; inpSig = 't' + L.k; }
    else if (O.form === 'flag') { inp = '<b>1단락·2단락에 같은 내용</b> (각 ' + L.k + '줄)'; inpHow = '1단락 입력(줄바꿈 ' + OK + ') → ' + BR + ' → 2단락에 같은 내용'; inpSig = 'f' + L.k; }
    else { inp = L.k + '줄'; inpHow = '줄바꿈 ' + OK; inpSig = 'n' + L.k; }
    add('input', '내용 입력', inp + ' <span class="cl-sub">← ‘입력할 내용’</span>', inpHow, inpSig);
    add('size', '문자 크기', '<b>' + L.pt + 'pt</b>', key('문자크기') + '를 눌러 ' + L.pt + 'pt가 될 때까지 (텍스트 입력 후에 설정, 줄 수에 따라 고를 수 있는 크기가 다름)', L.pt);
    if (!isT || O.align !== 'center') add('align', '정렬', '<b>' + AL_LABEL[O.align] + '</b>', ED + ' → 정렬 → ' + AL_LABEL[O.align] + ' → 문장전체', O.align);
    add('sp', '문자간격', '<b>' + SP_LABEL[O.sp] + '</b>', ED + ' → 문자간격 → ' + SP_LABEL[O.sp] + ' → 문장전체', O.sp);
    if (!isT && O.frame) add('frame', '테두리', '<b>' + O.frame + '번</b> <span class="cl-sub">' + FRAMES[O.frame].label.replace(/^\d+ /, '') + '</span>',
      ED + ' → 테두리·표 → ' + O.frame + ' → ' + (O.form === 'flag' ? '단락마다 적용' : '문장전체'), O.frame);
    add('mg', '여백', '<b>' + (O.mg === 'min' ? '매우적음' : '보통') + '</b> <span class="cl-sub">약 ' + f1(O.M) + 'mm</span>',
      ED + ' → 여백 → ' + (O.mg === 'min' ? '매우적음 (커트 마크가 찍히므로 가위로 자름)' : '보통'), O.mg);
    if (L.fixed) {
      var ta = O.form === 'flag' ? '균등' : O.form === 'wrap' ? '뒤모음' : AL_LABEL[O.align];
      add('len', '길이고정', '<b>' + L.fixed + 'cm</b> · 텍스트 정렬 <b>' + ta + '</b>', ED + ' → 길이고정 → ' + L.fixed + 'cm → ' + ta, L.fixed + '|' + ta);
    } else add('len', '길이고정', '안 함 <span class="cl-sub">자동 약 ' + f1(L.total) + 'mm</span>', '', 'auto');
    if (O.form === 'flag' && isT) add('print', '인쇄', '자동컷트 끄기 → 인쇄 → ' + ED + ' → 길이지정 <b>' + L.gap + 'mm</b> → 같은 표 인쇄 → 컷트',
      '표가 1·2단락을 쓰므로 설명서 ‘텍스트 사이 간격 설정’ 방식', 'ft' + L.gap);
    else if (O.form === 'flag') add('print', '인쇄', '인쇄 → 가운데 ' + f1(L.zone[1] - L.zone[0]) + 'mm 부분을 케이블에 감고 양 끝을 맞붙임', '', 'f');
    else if (O.form === 'wrap') add('print', '인쇄', '인쇄 → 글 없는 쪽 끝부터 ' + O.turns + '바퀴 감기 (앞 ' + f1(L.hidden) + 'mm는 겹쳐 가려짐)', '', 'w' + L.hidden);
    else add('print', '인쇄', '인쇄', '', 'p');
    st.forEach(function (s, i) { s.n = i + 1; });
    return st;
  }
  function stepsTable(st, prevMap) {
    return '<table class="cl-steps">' + st.map(function (s) {
      var pv = prevMap && prevMap[s.id];
      return '<tr><td class="n">' + s.n + '</td><td class="t">' + s.t + '</td><td>' + (prevMap ? '<span class="cl-chg">변경</span>' : '') + s.v +
        (pv ? ' <span class="cl-sub">이전</span><span class="cl-prev">' + pv.v.replace(/<[^>]+>/g, '') + '</span>' : '') +
        (s.how ? '<div class="cl-sub">' + s.how + '</div>' : '') + '</td></tr>';
    }).join('') + '</table>';
  }
  // 첫 건은 전체, 이후는 앞 건과 달라진 설정만
  function settingsHtml(i) {
    var cur = stepsOf(LABELS[i]);
    if (i === 0) return '<h3>본체 설정 (조작 순서)</h3>' + stepsTable(cur);
    var prev = stepsOf(LABELS[i - 1]), pm = {};
    prev.forEach(function (s) { pm[s.id] = s; });
    var chg = cur.filter(function (s) { return !pm[s.id] || pm[s.id].sig !== s.sig; });
    var h = '<h3>본체 설정 — 앞 건(#' + (LABELS[i - 1].ri + 1) + ')에서 바뀐 것만</h3>';
    h += chg.length ? stepsTable(chg, pm) : '<div class="cl-same">✓ 설정 변경 없음 — 내용만 바꿔 입력하고 인쇄</div>';
    return h + '<details class="cl-full"><summary>전체 설정 보기</summary>' + stepsTable(cur) + '</details>';
  }
  function contentHtml(L) {
    var O = META.O;
    if (L.kind === 'table') {
      var li = function (arr) { return '<ol class="cl-lines">' + arr.map(function (t) { return '<li>' + (t ? esc(t) : '<span class="cl-sub">(빈 칸)</span>') + '</li>'; }).join('') + '</ol>'; };
      return '<h3>입력할 내용 (표)' + (O.form === 'flag' ? ' — 2번 인쇄' : '') + '</h3><h4>1단락 · 항목명</h4>' + li(L.items.map(function (it) { return it.name; })) +
        '<h4>2단락 · 값</h4>' + li(L.items.map(function (it) { return it.value; }));
    }
    var sep = O.sep.trim();
    return '<h3>입력할 내용 · ' + L.k + '줄' + (O.form === 'flag' ? ' (1단락·2단락에 같은 내용)' : '') + '</h3><ol class="cl-lines">' + L.lines.map(function (t) {
      var h = esc(t);
      if (sep) h = h.split(esc(sep)).join('<span class="sep">' + esc(sep) + '</span>');
      return '<li>' + h + '</li>';
    }).join('') + '</ol>';
  }
  function dimText(L) {
    var O = META.O, M = f1(O.M), w = ' · 폭 ' + O.tape.w + 'mm';
    if (O.form === 'flag' && L.kind === 'table') return '총 ' + f1(L.total) + 'mm = [여백 ' + M + ' + 표 ' + f1(L.bw) + ' + 여백 ' + M + '] + 전송 ' + L.gap + ' + [같은 표]' + w;
    if (O.form === 'flag') return '총 ' + L.fixed + 'cm = 여백 ' + M + ' + 1단락 ' + f1(L.bw) + ' … 가운데 케이블 감기 ' + f1(O.circ) + ' … 2단락 ' + f1(L.bw) + ' + 여백 ' + M + w;
    if (O.form === 'wrap') return '총 ' + L.fixed + 'cm = 겹쳐 가려짐 ' + f1(L.hidden) + ' + 보이는 한 바퀴 ' + f1(O.circ) + ' (Ø' + O.dia + ' × ' + O.turns + '바퀴)' + w;
    return '총 ' + (L.fixed ? L.fixed + 'cm' : f1(L.total) + 'mm') + ' = 여백 ' + M + ' + 인쇄 범위 ' + f1(L.total - 2 * O.M) + ' + 여백 ' + M + w;
  }
  function warnHtml(L) { return L.warn.length ? '<ul class="cl-warn">' + L.warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : ''; }
  function lenText(L) { return L.fixed ? L.fixed + 'cm' : f1(L.total) + 'mm'; }

  // 라벨 한 건 (전체 보기·한 건씩 보기 공통)
  function cardBody(i, scale) {
    var L = LABELS[i], v = S.view;
    return '<div class="cl-stage' + (v.zoom === 'real' ? ' real' : '') + '">' + svgLabel(L, scale, { area: v.area, ruler: true }) + '</div>' +
      '<div class="cl-dim">' + dimText(L) + (v.area ? ' · 점선 = 인쇄 범위(여백 안쪽) × 인쇄 높이 약 ' + f1(META.O.H) + 'mm' : '') + '</div>' + warnHtml(L) +
      '<div class="cl-body"><div class="cl-panel">' + contentHtml(L) + '</div><div class="cl-panel">' + settingsHtml(i) + '</div></div>';
  }
  function scaleFor(L, avail) { return S.view.zoom === 'real' ? 96 / 25.4 : Math.max(2, Math.min(12, avail / (L.total + 1))); }
  function viewTools() {
    var v = S.view;
    return '<div class="seg"><label><input type="radio" name="clZoom" value="fit"' + (v.zoom !== 'real' ? ' checked' : '') + '>화면 맞춤</label>' +
      '<label><input type="radio" name="clZoom" value="real"' + (v.zoom === 'real' ? ' checked' : '') + '>실제 크기(근사)</label></div>' +
      '<label class="check"><input type="checkbox" id="clArea"' + (v.area ? ' checked' : '') + '>인쇄 범위 표시</label>';
  }

  function renderSummary() {
    var O = META.O, T = O.tape, n = LABELS.length, h = '';
    if (!n) { $('clSum').innerHTML = ''; return; }
    var tl = LABELS.map(function (L) { return L.total; }), mn = Math.min.apply(null, tl), mx = Math.max.apply(null, tl);
    var ps = LABELS.map(function (L) { return L.pt; }), pmn = Math.min.apply(null, ps), pmx = Math.max.apply(null, ps);
    var use = LABELS.reduce(function (a, L) { return a + L.total + O.waste; }, 0) / 1000;
    var wc = LABELS.filter(function (L) { return L.warn.length; }).length;
    h += '<span class="cl-chip">대상 <b>' + n + '건</b></span>';
    h += '<span class="cl-chip">' + swatch(T) + ' <b>' + T.code + '-PX</b> ' + T.w + 'mm</span>';
    h += '<span class="cl-chip">길이 <b>' + (mn === mx ? lenText(LABELS[0]) : f1(mn) + '~' + f1(mx) + 'mm') + '</b></span>';
    h += '<span class="cl-chip">문자 크기 <b>' + (pmn === pmx ? pmn : pmn + '~' + pmx) + 'pt</b>' + (O.unify && n > 1 && !O.ptFix ? ' · 기준 #' + (META.Pby + 1) : '') + '</span>';
    h += '<span class="cl-chip">' + (O.dir === 'v' ? '세로쓰기' : '가로쓰기') + ' · ' + AL_LABEL[O.align] + ' · 자간 ' + SP_LABEL[O.sp] + ' · 여백 ' + (O.mg === 'min' ? '매우적음' : '보통') +
      (O.content === 'table' ? ' · 표 ' + O.table : O.frame ? ' · 테두리 ' + O.frame : '') + '</span>';
    h += '<span class="cl-chip">테이프 사용 <b>약 ' + use.toFixed(2) + 'm</b> → ' + T.len + 'm 카트리지 <b>' + Math.max(1, Math.ceil(use / T.len)) + '개</b>' + (T.lenSure ? '' : ' (길이 가정)') + '</span>';
    if (wc) h += '<span class="cl-chip warn">경고 ' + wc + '건</span>';
    $('clSum').innerHTML = h;
  }
  function renderAll() {
    var n = LABELS.length;
    if (!n) { $('clResult').innerHTML = '<div class="cl-empty">표에 값을 넣으면 여기에 라벨이 표시됩니다.</div>'; return; }
    var avail = $('clResult').clientWidth - 2 * 14 - 2 * 18 - 4;
    var h = '<div class="cl-nav"><span class="cl-sub">첫 건은 설정 전체, 다음 건부터는 앞 건과 달라진 설정만 표시합니다.</span><span class="spacer"></span>' + viewTools() + '</div>';
    LABELS.forEach(function (L, i) {
      h += '<div class="cl-card' + (L.warn.length ? ' has-warn' : '') + '"><div class="cl-card-h"><span class="no">' + (i + 1) + ' / ' + n + '</span>' +
        '<span class="meta">표 #' + (L.ri + 1) + ' · ' + L.k + '줄 · ' + L.pt + 'pt · ' + lenText(L) + '</span><span class="spacer"></span>' +
        '<button type="button" class="btn sm" data-goto="' + i + '">이 건부터 한 건씩 보기</button></div>' + cardBody(i, scaleFor(L, avail)) + '</div>';
    });
    $('clResult').innerHTML = h;
  }
  function renderOne() {
    var n = LABELS.length;
    if (!n) { $('clResult').innerHTML = '<div class="cl-empty">표에 값을 넣으면 여기에 라벨이 표시됩니다.</div>'; return; }
    var v = S.view; v.idx = Math.min(Math.max(0, v.idx | 0), n - 1);
    var L = LABELS[v.idx], avail = $('clResult').clientWidth - 2 * 18 - 4;
    var h = '<div class="cl-nav">' +
      '<button type="button" class="btn" data-nav="-1"' + (v.idx === 0 ? ' disabled' : '') + '>◀ 이전</button>' +
      '<span class="pos">' + (v.idx + 1) + ' / ' + n + ' <span class="cl-sub">(표 #' + (L.ri + 1) + ')</span></span>' +
      '<button type="button" class="btn primary" data-nav="1"' + (v.idx === n - 1 ? ' disabled' : '') + '>다음 ▶</button>' +
      '<span class="cl-sub">← → 키로도 이동</span><span class="spacer"></span>' + viewTools() + '</div>';
    $('clResult').innerHTML = h + cardBody(v.idx, scaleFor(L, avail));
  }
  function renderResult() {
    renderSummary();
    if (S.view.mode === 'one') renderOne(); else renderAll();
  }
  function renderOptHints() {
    var O = readOpt(), T = O.tape, form = O.form, isT = O.content === 'table';
    $('tapeInfo').innerHTML = swatch(T) + ' <b>' + T.code + '-PX</b> · 폭 ' + T.w + 'mm · ' + esc(T.desc) + ' · ' + T.mat + ' · ' + T.len + 'm' + (T.lenSure ? '' : '(가정)') +
      ' · 최대 문자 크기 ' + HPT[T.w] + 'pt' + (HPT_SURE[T.w] ? '' : '(추정)') + ' · 최대 ' + O.Lmax + '줄';
    [].forEach.call(document.querySelectorAll('input[name="dir"]'), function (r) { r.disabled = isT; });
    $('frame').disabled = isT;
    $('table').disabled = !isT;
    $('clList').classList.toggle('cl-is-table', isT);
    $('maxText').disabled = form === 'wrap';
    var w = [];
    if (form === 'wrap' && T.extra !== 'flex') w.push('감싸기형은 잘 휘는 비닐 테이프(SVN12·SVN18)가 들뜨지 않아 좋습니다. PET 테이프는 둥근 케이블에서 끝이 뜰 수 있습니다.');
    if (form === 'wrap' && O.mg === 'normal') w.push('감싸기형에서 여백 보통(약 10mm)은 보이는 한 바퀴를 많이 차지합니다. 글이 작으면 여백 매우적음을 고려하세요.');
    if (form === 'flag' && T.w < 9) w.push('깃발형은 9mm 이상 테이프가 붙는 면이 넓어 튼튼합니다.');
    if (T.bg === 'clear') w.push('투명 테이프는 검은 케이블 위에서 글자가 잘 보이지 않습니다. 깃발형이면 괜찮습니다.');
    if ((O.align === 'justify' || (form === 'flag' && !isT)) && O.sp !== 'normal') w.push('설명서: 균등 정렬은 문자간격이 ‘보통’일 때 적용됩니다' + (form === 'flag' && !isT ? ' (깃발형은 길이고정 균등을 씀)' : '') + '.');
    if (O.mg === 'min') w.push('여백 매우적음: 커트 마크가 인쇄되어 가위로 잘라야 합니다(설명서).');
    if (O.frame) w.push('테두리를 넣으면 안쪽 공간만큼 문자 크기가 한 단계 작아질 수 있습니다' + (HPT[T.w] === 38 ? ' (18mm: 1줄 38pt → 26pt)' : '') + '.');
    $('optWarn').innerHTML = w.map(esc).join('<br>');
    $('formHint').textContent = form === 'flag' ? '케이블에 한 바퀴 감고 양 끝을 맞붙여 깃발처럼' : form === 'wrap' ? '케이블에 감아 붙임 (글은 바깥 한 바퀴에)' : '플러그·태그 등 평면에 붙임';
    $('contentHint').textContent = isT ? '인쇄할 열마다 한 행: 1단락 열 이름 | 2단락 값' : '열 값을 줄 수·문자 크기에 맞게 자동 배치';
    $('ptHint').textContent = '본체 크기: 38·26·19·13·10·6pt · 이 테이프 1줄 최대 ' + HPT[T.w] + 'pt';
    $('maxTextLabel').textContent = form === 'wrap' ? '글씨 최대 길이 (감싸기는 자동)' : '글씨 최대 길이 (mm)';
    $('maxTextHint').textContent = form === 'wrap' ? '보이는 한 바퀴(' + f1(Math.PI * O.dia) + 'mm) − 여백 안에 맞춤' : (form === 'flag' ? '깃발 한 면의 글 길이 상한' : '여백 뺀 글 길이 상한') + ' — 이 안에서 가장 큰 pt';
    $('mgHint').textContent = O.mg === 'min' ? '커트 마크 인쇄 → 가위로 자름' : '자동컷트로 잘림';
    $('hOverHint').textContent = '비우면 ' + T.w + 'mm 테이프 최대 ' + HPT[T.w] + 'pt = ' + f1(HPT[T.w] * PTMM) + 'mm';
  }

  var timer = null;
  function update(now) {
    clearTimeout(timer);
    var run = function () {
      LABELS = compute();
      refreshDetected();
      renderOptHints();
      renderResult();
      saveData();
    };
    if (now) run(); else timer = setTimeout(run, 120);
  }

  // ── 이벤트 ──
  var grid = $('clGrid');
  grid.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-h')) S.cols[+t.getAttribute('data-h')].name = t.value;
    else if (t.hasAttribute('data-r')) S.rows[+t.getAttribute('data-r')].cells[+t.getAttribute('data-c')] = t.value;
    else return;
    update();
  });
  grid.addEventListener('change', function (e) {
    var t = e.target, k = t.getAttribute('data-cf');
    if (k) { var c = S.cols[+t.getAttribute('data-c')]; c[k] = t.type === 'checkbox' ? t.checked : t.value; update(true); }
    else if (t.hasAttribute('data-on')) { var r = +t.getAttribute('data-on'); S.rows[r].on = t.checked; t.closest('tr').className = t.checked ? '' : 'off'; update(true); }
  });
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-delrow')) { S.rows.splice(+b.getAttribute('data-delrow'), 1); if (!S.rows.length) addRow(); }
    else if (b.hasAttribute('data-delcol')) { var c = +b.getAttribute('data-delcol'); if (S.cols.length <= 1) return; S.cols.splice(c, 1); S.rows.forEach(function (r) { r.cells.splice(c, 1); }); }
    else return;
    renderTable(); update(true);
  });
  grid.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key !== 'Enter' || !t.hasAttribute('data-r')) return;
    e.preventDefault();
    var r = +t.getAttribute('data-r') + 1, c = t.getAttribute('data-c');
    if (r >= S.rows.length) { addRow(); renderTable(); update(true); }
    var nx = grid.querySelector('input[data-r="' + r + '"][data-c="' + c + '"]'); if (nx) nx.focus();
  });
  grid.addEventListener('paste', onPaste);
  $('clBtns').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'addrow') addRow();
    else if (a === 'addcol') addCol();
    else if (a === 'sample') sample();
    else if (a === 'clear') { S.cols = [0, 1, 2].map(blankCol); S.rows = []; for (var i = 0; i < 5; i++) addRow(); }
    renderTable(); update(true);
    if (a === 'addrow') { var last = grid.querySelector('input[data-r="' + (S.rows.length - 1) + '"][data-c="0"]'); if (last) last.focus(); }
  });
  $('clOpts').addEventListener('input', function () { update(); });
  $('clOpts').addEventListener('change', function () { update(true); });
  $('clViewSeg').addEventListener('change', function () { S.view.mode = radio('clView'); renderResult(); saveData(); });
  $('clResult').addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]');
    if (g) { S.view.mode = 'one'; S.view.idx = +g.getAttribute('data-goto'); setRadio('clView', 'one'); renderResult(); saveData(); window.scrollTo(0, $('clViewSeg').getBoundingClientRect().top + window.pageYOffset - 70); return; }
    var nb = e.target.closest('[data-nav]');
    if (nb) { S.view.idx += +nb.getAttribute('data-nav'); renderResult(); saveData(); }
  });
  $('clResult').addEventListener('change', function (e) {
    if (e.target.name === 'clZoom') S.view.zoom = e.target.value;
    else if (e.target.id === 'clArea') S.view.area = e.target.checked;
    else return;
    renderResult(); saveData();
  });
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName, typ = e.target.type;
    if (S.view.mode !== 'one' || (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) && typ !== 'radio' && typ !== 'checkbox')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var ni = S.view.idx + (e.key === 'ArrowRight' ? 1 : -1);
      if (ni < 0 || ni >= LABELS.length) return;
      e.preventDefault(); S.view.idx = ni; renderResult(); saveData();
    }
  });
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(renderResult, 150); });

  // ── 시작 ──
  fillSelects();
  Portal.persist($('clOpts'));          // 설정 칸은 입력칸이 다 생긴 뒤 저장·복원
  var data = Portal.store.get('data', null);
  if (data && data.cols && data.cols.length) {
    S.cols = data.cols; S.rows = data.rows && data.rows.length ? data.rows : [];
    S.rows.forEach(function (r) { while (r.cells.length < S.cols.length) r.cells.push(''); });
    if (!S.rows.length) addRow();
  } else sample();
  var view = Portal.store.get('view', null);
  if (view) for (var k in view) if (view.hasOwnProperty(k)) S.view[k] = view[k];
  setRadio('clView', S.view.mode);
  renderTable();
  update(true);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('500 20px Pretendard', '가A'), document.fonts.load('700 20px Pretendard', '가A')])
      .then(function () { mCache = {}; renderTable(); update(true); }, function () {});
  }
})();
