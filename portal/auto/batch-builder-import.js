/*
 * 배치파일 블록 조립기 — 가지고 있는 배치 코드를 블록으로 바꾸기
 * batch-builder.js 보다 먼저 로드됩니다. 내보내는 것: window.BatchImport.parse(text, mk)
 *   mk(type, fields, children, elseChildren) → 블록 (batch-builder.js 가 넘겨줌)
 *   반환 { blocks, options:{echoOff,cdSelf,admin,pauseEnd,selfDel,utf8}, lines, raw }
 *
 * 규칙에 딱 맞는 문장만 블록으로 바꾸고, 나머지는 원문 그대로 "코드 직접 입력"(runcmd) 블록에 넣습니다.
 * 그런 블록에는 src(원본 줄 번호 "12" 또는 "12~14")와 why(블록으로 못 바꾼 이유)를 붙입니다.
 * 원문 그대로 넣으므로 동작은 원본과 같습니다.
 */
(function () {
  'use strict';

  var VAR_NAME = '[A-Za-z_\\u3131-\\uD79D][\\w\\u3131-\\uD79D]*';
  var RE_NAME = new RegExp('^' + VAR_NAME + '$');
  var RE_VAR_ONLY = new RegExp('^%(' + VAR_NAME + ')%$');
  var RE_VAR_TOK = new RegExp('^"?[%!](' + VAR_NAME + ')[%!]"?$');
  var RE_BANG = new RegExp('!(' + VAR_NAME + '(?::[^!\\n]*)?)!', 'g');

  // ================= 1. 구문 해석: 괄호 블록 · IF · FOR · & && || =================
  // 노드: blank / comment{t} / label{t} / cmd{t} / chain{items,ops} / group{body,tail} / if{cond,then,els} / for{sw,opt,root,v,set,body}
  //       모든 노드에 a(시작 위치), b(끝 위치)
  function parseScript(s) {
    var p = 0, n = s.length, nl = [0];
    for (var i = 0; i < n; i++) if (s.charAt(i) === '\n') nl.push(i + 1);

    function lineOf(pos) {
      var lo = 0, hi = nl.length - 1;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (nl[mid] <= pos) lo = mid; else hi = mid - 1; }
      return lo + 1;
    }
    function ch(k) { return s.charAt(p + (k || 0)); }
    function ws() { while (p < n && (ch() === ' ' || ch() === '\t')) p++; }
    function kw(word) {
      if (s.substr(p, word.length).toUpperCase() !== word) return false;
      var nx = s.charAt(p + word.length);
      return !nx || !/[A-Za-z0-9_]/.test(nx);
    }
    function toEol() { var a = p; while (p < n && ch() !== '\n') p++; return s.slice(a, p); }
    function quoted() { var a = ++p; while (p < n && ch() !== '"' && ch() !== '\n') p++; var t = s.slice(a, p); if (ch() === '"') p++; return t; }

    // 명령 하나: 줄 끝, & && ||, (괄호 안이면) 짝 없는 ) 에서 멈춤. ^ 이스케이프는 그대로 둠
    function simple(inParen) {
      var out = '', q = false;
      while (p < n) {
        var c = ch();
        if (c === '\n') break;
        if (c === '"') { q = !q; out += c; p++; continue; }
        if (!q && c === '^') { if (ch(1) === '\n') { p += 2; continue; } out += c + ch(1); p += 2; continue; }
        if (!q && c === '>' && ch(1) === '&') { out += '>&'; p += 2; continue; }   // 2>&1 의 & 는 명령 구분이 아님
        if (!q && (c === '&' || (c === '|' && ch(1) === '|'))) break;
        if (!q && inParen && c === ')') break;
        out += c; p++;
      }
      return out;
    }
    // IF 조건의 낱말 하나
    function token() {
      var out = '', q = false;
      while (p < n) {
        var c = ch();
        if (c === '\n') break;
        if (c === '"') { q = !q; out += c; p++; continue; }
        if (!q) {
          if (c === ' ' || c === '\t' || c === '(' || c === ')' || c === '&' || c === '|' || c === ',' || c === ';') break;
          if (c === '=' && ch(1) === '=') break;
          if (c === '^') { out += c + ch(1); p += 2; continue; }
        }
        out += c; p++;
      }
      return out;
    }

    function list(inParen) {
      var out = [];
      while (p < n) {
        ws();
        if (p >= n) break;
        if (ch() === '\n') { out.push({ k: 'blank', a: p, b: p }); p++; continue; }
        if (inParen && ch() === ')') { p++; return out; }
        var before = p;
        out.push(chain(inParen));
        ws();
        if (ch() === '\n') p++;
        else if (p === before) p++;   // 혹시 못 읽고 멈추면 한 글자 건너뜀
      }
      return out;
    }
    function chain(inParen) {
      var first = stmt(inParen), items = [first], ops = [];
      for (;;) {
        ws();
        var op = s.substr(p, 2) === '&&' ? '&&' : s.substr(p, 2) === '||' ? '||' : ch() === '&' ? '&' : '';
        if (!op) break;
        p += op.length; ws();
        if (p >= n || ch() === '\n' || (inParen && ch() === ')')) break;
        ops.push(op); items.push(stmt(inParen));
      }
      return ops.length ? { k: 'chain', items: items, ops: ops, a: first.a, b: items[items.length - 1].b } : first;
    }
    function stmt(inParen) {
      ws();
      var a = p;
      while (ch() === '@') { p++; ws(); }
      if (s.substr(p, 2) === '::') { var c1 = toEol(); return { k: 'comment', t: c1.slice(2).replace(/^\s/, ''), a: a, b: p }; }
      if (ch() === ':') { p++; var lb = toEol().trim().split(/[\s+]/)[0]; return { k: 'label', t: lb, a: a, b: p }; }
      if (kw('REM')) { p += 3; var c2 = toEol(); return { k: 'comment', t: c2.replace(/^[\s.:]/, '').replace(/\s+$/, ''), a: a, b: p }; }
      var w = (/^[^\s(&|<>=,;"\/]+/.exec(s.substr(p, 12)) || [''])[0].toUpperCase();
      if (w === 'IF') return ifStmt(a, inParen);
      if (w === 'FOR') return forStmt(a, inParen);
      if (ch() === '(') { p++; var body = list(true); var tail = simple(inParen); return { k: 'group', body: body, tail: tail.trim(), a: a, b: p }; }
      var t = simple(inParen);
      return { k: 'cmd', t: t, a: a, b: p };
    }
    function ifStmt(a, inParen) {
      p += 2; ws();
      var cond = { ci: false, not: false };
      if (/^\/I(?![A-Za-z0-9])/i.test(s.substr(p, 3))) { cond.ci = true; p += 2; ws(); }
      if (kw('NOT')) { cond.not = true; p += 3; ws(); }
      if (kw('EXIST')) { p += 5; ws(); cond.t = 'exist'; cond.arg = token(); }
      else if (kw('ERRORLEVEL')) { p += 10; ws(); cond.t = 'errlvl'; cond.arg = token(); }
      else if (kw('DEFINED')) { p += 7; ws(); cond.t = 'defined'; cond.arg = token(); }
      else {
        cond.t = 'cmp'; cond.lhs = token(); ws();
        if (s.substr(p, 2) === '==') { p += 2; cond.op = '=='; } else cond.op = token().toUpperCase();
        ws(); cond.rhs = token();
      }
      ws();
      var node = { k: 'if', cond: cond, then: [], els: null, a: a, b: p };
      if (ch() === '(') {
        p++; node.then = list(true);
        var save = p; ws();
        if (kw('ELSE')) {
          p += 4; ws();
          if (ch() === '(') { p++; node.els = list(true); }
          else node.els = [chain(inParen)];
        } else p = save;
      } else if (p >= n || ch() === '\n') node.bad = true;
      else node.then = [chain(inParen)];
      node.b = p;
      return node;
    }
    function forStmt(a, inParen) {
      p += 3; ws();
      var f = { k: 'for', sw: '', opt: '', root: '', v: '', set: '', body: [], a: a, b: p };
      if (ch() === '/') {
        f.sw = s.substr(p, 2).toUpperCase(); p += 2; ws();
        if (f.sw === '/F' && ch() === '"') { f.opt = quoted(); ws(); }
        else if (f.sw === '/R' && ch() !== '%') { f.root = token(); ws(); }
      }
      var m = /^%%?([A-Za-z])/.exec(s.substr(p, 3));
      if (!m) return fallback(a, inParen);
      p += m[0].length; f.v = m[1]; ws();
      if (!kw('IN')) return fallback(a, inParen);
      p += 2; ws();
      if (ch() !== '(') return fallback(a, inParen);
      p++;
      var eol = s.indexOf('\n', p); if (eol < 0) eol = n;
      var cm = f.sw === '/F' ? /^(['`])([\s\S]*)\1\s*\)(?=\s*DO\b)/i.exec(s.slice(p, eol)) : null;
      if (cm) { f.set = cm[1] + cm[2] + cm[1]; p += cm[0].length; }
      else {
        var sa = p, q = false, depth = 0;
        while (p < eol) {
          var c = ch();
          if (c === '"') q = !q;
          else if (!q && c === '(') depth++;
          else if (!q && c === ')') { if (!depth) break; depth--; }
          p++;
        }
        if (ch() !== ')') return fallback(a, inParen);
        f.set = s.slice(sa, p).trim(); p++;
      }
      ws();
      if (!kw('DO')) return fallback(a, inParen);
      p += 2; ws();
      if (ch() === '(') { p++; f.body = list(true); }
      else if (p >= n || ch() === '\n') return fallback(a, inParen);
      else f.body = [chain(inParen)];
      f.b = p;
      return f;
    }
    function fallback(a, inParen) {
      p = a; while (ch() === '@') p++;
      var t = simple(inParen);
      return { k: 'cmd', t: t, a: a, b: p, bad: true };
    }

    // 노드의 원문 (공통 들여쓰기 제거)
    function raw(nd) {
      var a = nd.a, ls = nl[lineOf(a) - 1];
      if (/^[ \t]*$/.test(s.slice(ls, a))) a = ls;
      var lines = s.slice(a, nd.b).replace(/\s+$/, '').split('\n'), min = Infinity;
      lines.forEach(function (l) { if (l.trim()) min = Math.min(min, /^[ \t]*/.exec(l)[0].length); });
      if (min === Infinity) min = 0;
      return lines.map(function (l) { return l.slice(Math.min(min, /^[ \t]*/.exec(l)[0].length)); }).join('\n');
    }

    return { nodes: list(false), raw: raw, lineOf: lineOf, lines: nl.length - (s.charAt(n - 1) === '\n' ? 1 : 0) };
  }

  // ================= 2. 작은 도우미 =================
  function unq(t) { t = String(t == null ? '' : t).trim(); return /^".*"$/.test(t) ? t.slice(1, -1) : t; }
  function isInt(t) { return /^-?\d+$/.test(String(t).trim()); }
  function isFlag(t) { return /^\/[A-Za-z?]/.test(t); }
  function firstWord(c) { return (/^[^\s"&|<>=,;(\/]+/.exec(c) || [''])[0].toUpperCase(); }
  // 따옴표를 지키며 공백으로 나누기 (따옴표는 남김)
  function args(t) {
    var out = [], cur = '', q = false, has = false;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === '"') { q = !q; cur += c; has = true; continue; }
      if (!q && /\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } continue; }
      cur += c; has = true;
    }
    if (has) out.push(cur);
    return out;
  }
  // 리디렉션(>nul, 2>&1, >> 파일 …) 떼어내기
  function splitRedir(t) {
    var out = '', redirs = [], q = false, i = 0;
    while (i < t.length) {
      var c = t.charAt(i);
      if (c === '"') { q = !q; out += c; i++; continue; }
      if (!q && c === '^') { out += c + t.charAt(i + 1); i += 2; continue; }
      if (!q && (c === '>' || c === '<' || (/[0-9]/.test(c) && t.charAt(i + 1) === '>' && (i === 0 || /\s/.test(t.charAt(i - 1)))))) {
        var m = /^([0-9]?)(>>|>|<)\s*(&[0-9]|"[^"]*"|[^\s"&|<>]+)/.exec(t.slice(i));
        if (m) { redirs.push({ fd: m[1] || (m[2] === '<' ? '0' : '1'), op: m[2], to: m[3] }); i += m[0].length; continue; }
      }
      out += c; i++;
    }
    return { cmd: out.replace(/^\s+|\s+$/g, ''), redirs: redirs };
  }
  function hasPipe(c) {
    for (var i = 0, q = false; i < c.length; i++) {
      var x = c.charAt(i);
      if (x === '"') q = !q; else if (!q && x === '^') i++; else if (!q && x === '|') return true;
    }
    return false;
  }
  function isNul(r) { return /^nul$/i.test(unq(r.to)) || /^&[0-9]$/.test(r.to); }

  // 오류 코드 조건 → { n, rel: ge|lt|eq|ne }
  function errLevelCond(c) {
    if (!c) return null;
    if (c.t === 'errlvl') { var k = parseInt(c.arg, 10); return isNaN(k) ? null : { n: k, rel: c.not ? 'lt' : 'ge' }; }
    if (c.t === 'cmp' && /^"?[%!]ERRORLEVEL[%!]"?$/i.test(c.lhs)) {
      var v = parseInt(unq(c.rhs), 10);
      if (isNaN(v)) return null;
      var rel = { '==': 'eq', EQU: 'eq', NEQ: 'ne', GEQ: 'ge', GTR: 'gt', LSS: 'lt', LEQ: 'le' }[c.op];
      if (!rel) return null;
      if (c.not) rel = { eq: 'ne', ne: 'eq', ge: 'lt', lt: 'ge', gt: 'le', le: 'gt' }[rel];
      if (rel === 'gt') { rel = 'ge'; v += 1; }
      if (rel === 'le') { rel = 'lt'; v += 1; }
      return { n: v, rel: rel };
    }
    return null;
  }
  function okFail(e) {
    if (!e) return null;
    if ((e.rel === 'ge' && e.n === 1) || (e.rel === 'ne' && e.n === 0)) return 'fail';
    if ((e.rel === 'lt' && e.n === 1) || (e.rel === 'eq' && e.n === 0)) return 'ok';
    return null;
  }
  function choiceYN(e) {
    if (!e) return null;
    if ((e.rel === 'ge' && e.n === 2) || (e.rel === 'eq' && e.n === 2) || (e.rel === 'ne' && e.n === 1)) return 'n';
    if ((e.rel === 'lt' && e.n === 2) || (e.rel === 'eq' && e.n === 1) || (e.rel === 'ne' && e.n === 2)) return 'y';
    return null;
  }
  function tasklistName(t) {
    var c = splitRedir(t).cmd, m;
    if ((m = /^TASKLIST(?:\s+\/NH)?\s+\/FI\s+"IMAGENAME\s+eq\s+([^"]+)"(?:\s+\/NH)?\s*\|\s*FIND(?:STR)?\s+(?:\/I\s+)?"[^"]+"$/i.exec(c))) return m[1].trim();
    if ((m = /^TASKLIST(?:\s+\/NH)?\s*\|\s*FIND(?:STR)?\s+(?:\/I\s+)?"([^"]+)"$/i.exec(c))) return m[1].trim();
    return '';
  }

  // ================= 3. 블록으로 바꾸기 =================
  function parse(text, mk) {
    var src = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var P = parseScript(src);
    var delayed = /^[ \t]*@?[ \t]*SETLOCAL\b[^\n]*ENABLEDELAYEDEXPANSION/im.test(src);
    var opt = { echoOff: false, cdSelf: false, admin: false, pauseEnd: false, selfDel: false, utf8: false };
    var quiet = 0;   // 블록에 없어 뺀 "> nul" 출력 숨김 수

    function unesc(t) {
      t = String(t).replace(/\^(.)/g, '$1').replace(/%%(?![A-Za-z~])/g, '%');
      return delayed ? t.replace(/\^!/g, '!') : t;
    }
    function pctUn(t) { t = String(t).replace(/%%(?![A-Za-z~])/g, '%'); return delayed ? t.replace(/\^!/g, '!') : t; }
    function cmdOf(nd) { return nd && nd.k === 'cmd' ? splitRedir(nd.t.replace(/^@+/, '')).cmd : ''; }

    function rawOf(nd, why) {
      var b = mk('runcmd', { cmd: P.raw(nd) });
      b._from = P.lineOf(nd.a); b._to = P.lineOf(Math.max(nd.a, nd.b - 1)); b._why = why;
      return b;
    }
    function add(out, x) {
      if (!x) return;
      if (Array.isArray(x)) { x.forEach(function (y) { add(out, y); }); return; }
      var last = out[out.length - 1];
      if (x._from && last && last._from && x.type === 'runcmd' && last.type === 'runcmd') {
        last.fields.cmd += '\n' + x.fields.cmd;
        last._to = Math.max(last._to, x._to);
        if (last._why.split(', ').indexOf(x._why) < 0) last._why += ', ' + x._why;
        return;
      }
      out.push(x);
    }

    // 블록은 "있으면 건너뜀"이라 오류 코드가 원본과 달라짐 → 결과로 분기하면 원문 그대로
    function errSensitive(nd) { return nd && nd.k === 'cmd' && /^(MKDIR|MD|RMDIR|RD)$/.test(firstWord(cmdOf(nd))); }
    function convList(nodes, inParen) {
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var nd = nodes[i];
        if (nd.k === 'blank') { if (!inParen && out.length && out[out.length - 1].type !== 'blank') out.push(mk('blank')); continue; }
        if (nd.k === 'comment' && inParen && nd.t.trim() === '비어 있음') continue;   // 조립기가 넣는 빈 칸 채움
        var j = i + 1;
        while (j < nodes.length && nodes[j].k === 'blank') j++;
        var pair = pairOf(nd, nodes[j]);
        if (pair) { add(out, pair); i = j; continue; }
        if (errSensitive(nd) && nodes[j] && nodes[j].k === 'if' && errLevelCond(nodes[j].cond)) { add(out, rawOf(nd, firstWord(cmdOf(nd)) + ' 결과(오류 코드)로 분기')); continue; }
        add(out, convNode(nd, inParen));
      }
      while (out.length && out[out.length - 1].type === 'blank') out.pop();
      return out;
    }
    function convNode(nd, inParen) {
      switch (nd.k) {
        case 'comment': return mk('comment', { text: inParen ? nd.t.replace(/\^\)/g, ')') : nd.t });
        case 'label': return inParen ? rawOf(nd, '조건·반복 안의 라벨') : mk('label', { name: nd.t });
        case 'group': return nd.tail ? rawOf(nd, '괄호 묶음 + 출력 돌리기') : convList(nd.body, inParen);
        case 'chain': return convChain(nd, inParen);
        case 'if': return convIf(nd);
        case 'for': return convFor(nd);
        default: return convCmd(nd, inParen);
      }
    }

    // CHOICE + IF ERRORLEVEL, TASKLIST|FIND + IF ERRORLEVEL 두 줄 짝
    function pairOf(nd, nx) {
      if (!nx || nd.k !== 'cmd' || nx.k !== 'if') return null;
      var e = errLevelCond(nx.cond), c = cmdOf(nd);
      if (/^CHOICE\b/i.test(c)) {
        var A = args(c).slice(1), keys = '', msg = null;
        for (var i = 0; i < A.length; i++) {
          var u = A[i].toUpperCase();
          if (u === '/C') keys = unq(A[++i] || ''); else if (/^\/C:/.test(u)) keys = unq(A[i].slice(3));
          else if (u === '/M') msg = unq(A[++i] || ''); else if (/^\/M:/.test(u)) msg = unq(A[i].slice(3));
          else return null;
        }
        var yn = choiceYN(e);
        if (keys.toUpperCase() !== 'YN' || msg === null || !yn) return null;
        var tb = convList(nx.then, true), eb = nx.els ? convList(nx.els, true) : null;
        return yn === 'y' ? mk('if_yes', { msg: pctUn(msg) }, tb, eb) : mk('if_yes', { msg: pctUn(msg) }, eb || [], tb);
      }
      var name = tasklistName(nd.t), of = okFail(e);
      if (name && of) return mk('if_running', { name: name, st: of === 'ok' ? 'y' : 'n' }, convList(nx.then, true), nx.els ? convList(nx.els, true) : null);
      return null;
    }

    function convChain(nd, inParen) {
      var ops = nd.ops, items = nd.items;
      if (ops.every(function (o) { return o === '&'; })) {
        var out = [];
        items.forEach(function (it) { add(out, convNode(it, inParen)); });
        return out;
      }
      if (items.length === 2 || (items.length === 3 && ops[0] === '&&' && ops[1] === '||')) {
        var okB = ops[0] === '&&' ? convList([items[1]], true) : null;
        var ngB = ops[0] === '||' ? convList([items[1]], true) : items[2] ? convList([items[2]], true) : null;
        var then = okB || ngB, els = okB && ngB ? ngB : null;
        var run = items[0].k === 'cmd' ? tasklistName(items[0].t) : '';
        if (run) return mk('if_running', { name: run, st: okB ? 'y' : 'n' }, then, els);
        var left = errSensitive(items[0]) ? rawOf(items[0], firstWord(cmdOf(items[0])) + ' 결과(오류 코드)로 분기') : convNode(items[0], inParen);
        return [].concat(left, mk('if_fail', { when: okB ? 'ok' : 'fail' }, then, els));
      }
      return rawOf(nd, '&& / || 를 여러 번 이은 줄');
    }

    function convIf(nd) {
      var c = nd.cond;
      if (nd.bad) return rawOf(nd, 'IF 형식');
      var thenB = function () { return convList(nd.then, true); };
      var elseB = function () { return nd.els ? convList(nd.els, true) : null; };
      if (c.t === 'exist') {
        var path = unq(c.arg);
        if (!nd.els && nd.then.length === 1 && nd.then[0].k === 'cmd') {
          var one = cmdOf(nd.then[0]), mm;
          if (c.not && (mm = /^(?:MKDIR|MD)\s+(.+)$/i.exec(one)) && unq(mm[1]) === path) return mk('mkdir', { path: path });
          if (!c.not && (mm = /^(?:RMDIR|RD)\s+(?:\/S\s+\/Q|\/Q\s+\/S)\s+(.+)$/i.exec(one)) && unq(mm[1]) === path) return mk('rmdir', { path: path });
        }
        return mk(c.not ? 'if_not_exist' : 'if_exist', { path: path }, thenB(), elseB());
      }
      var of = okFail(errLevelCond(c));
      if (of) return mk('if_fail', { when: of }, thenB(), elseB());
      if (c.t === 'cmp') {
        var L = c.lhs, R = c.rhs, vm = RE_VAR_TOK.exec(L), vr = RE_VAR_TOK.exec(R);
        var eq = c.op === '==' || c.op === 'EQU', ne = c.op === 'NEQ';
        if (!vm && vr && (eq || ne)) { var tmp = L; L = R; R = tmp; vm = vr; }
        var val = unq(R);
        if (vm && val.indexOf('"') < 0) {
          var op = eq ? '==' : ne ? '!=' : c.op;
          if (c.not) { if (op === '==') op = '!='; else if (op === '!=') op = '=='; else return rawOf(nd, 'IF NOT + 숫자 비교'); }
          if (['==', '!=', 'GTR', 'GEQ', 'LSS', 'LEQ'].indexOf(op) >= 0) return mk('if_eq', { name: vm[1], value: pctUn(val), op: op }, thenB(), elseB());
        }
      }
      return rawOf(nd, c.t === 'defined' ? 'IF DEFINED' : c.t === 'errlvl' ? 'IF ERRORLEVEL ' + c.arg : 'IF 조건 형식');
    }

    function parseForOpts(o) {
      var r = { usebackq: false, delims: undefined, tokens: undefined };
      var rest = o.replace(/\busebackq\b/i, function () { r.usebackq = true; return ''; });
      rest = rest.replace(/\btokens=(\S+)/i, function (m, v) { r.tokens = v; return ''; });
      rest = rest.replace(/\bdelims=(.*)$/i, function (m, v) { r.delims = v.trim(); return ''; });
      return rest.trim() ? null : r;
    }
    function convFor(nd) {
      if (!/^[A-Za-z]$/.test(nd.v)) return rawOf(nd, 'FOR 형식');
      var body = function () { return convList(nd.body, true); };
      if (nd.sw === '' || nd.sw === '/R') {
        var items = args(nd.set);
        if (items.length !== 1 || !/[*?]/.test(items[0])) return rawOf(nd, nd.sw ? 'FOR /R 목록' : 'FOR 목록 반복 (와일드카드 아님)');
        var it = unq(items[0]), dir = '.', pat = it;
        if (nd.sw === '/R') {
          if (/\\/.test(it)) return rawOf(nd, 'FOR /R 형식');
          dir = nd.root ? unq(nd.root) : '.';
        } else {
          var k = it.lastIndexOf('\\');
          if (k >= 0) { dir = it.slice(0, k) || '\\'; pat = it.slice(k + 1); }
        }
        return mk('for_files', { dir: dir, pattern: pat, sub: nd.sw === '/R' ? 'y' : 'n', v: nd.v }, body());
      }
      if (nd.sw === '/L') {
        var nums = nd.set.split(/[\s,]+/).filter(Boolean);
        if (nums.length !== 3 || !nums.every(isInt)) return rawOf(nd, 'FOR /L 형식');
        return mk('for_count', { from: nums[0], step: nums[1], to: nums[2], v: nd.v }, body());
      }
      if (nd.sw === '/F') {
        var o = parseForOpts(nd.opt);
        if (!o) return rawOf(nd, 'FOR /F 옵션 "' + nd.opt + '"');
        var dm = /^'\s*POWERSHELL(?:\.EXE)?\s+(?:-NoProfile\s+)?(?:-Command\s+)?"\s*Get-Date\s+-Format\s+'?([^'"]+?)'?\s*"\s*'$/i.exec(nd.set);
        if (dm && nd.body.length === 1 && nd.body[0].k === 'cmd') {
          var sm = new RegExp('^SET\\s+"?(' + VAR_NAME + ')=%%' + nd.v + '"?$', 'i').exec(cmdOf(nd.body[0]));
          if (sm) return mk('stamp', { name: sm[1], fmt: dm[1].trim() });
        }
        var isFile = o.usebackq ? /^("[^"]+"|[^"'`\s]+)$/.test(nd.set) : /^[^"'`\s]+$/.test(nd.set);
        var whole = (o.delims === '' && (o.tokens === undefined || o.tokens === '*')) || (o.tokens === '*' && o.delims === undefined);
        if (isFile && whole) return mk('for_lines', { file: unq(nd.set), v: nd.v }, body());
        return rawOf(nd, /^['`]/.test(nd.set) ? 'FOR /F (명령 결과 읽기)' : 'FOR /F 형식');
      }
      return rawOf(nd, 'FOR ' + nd.sw);
    }

    function convCmd(nd, inParen) {
      var t = nd.t.replace(/^@+/, '').trim();
      if (!t) return null;
      var w0 = firstWord(t);
      if (nd.bad) return rawOf(nd, (w0 || '명령') + ' 형식');
      var R = splitRedir(t), c = R.cmd, files = R.redirs.filter(function (r) { return !isNul(r); });
      var w = firstWord(c);
      if (R.redirs.length && !files.length && ['TIMEOUT', 'TASKKILL', 'PAUSE', 'PING', 'FORFILES', 'MKDIR', 'MD'].indexOf(w) < 0) {
        var res = convCmd2(nd, inParen, t, R, c, files, w);
        if (res && res.type !== 'runcmd') quiet++;
        return res;
      }
      return convCmd2(nd, inParen, t, R, c, files, w);
    }
    function convCmd2(nd, inParen, t, R, c, files, w) {
      if (hasPipe(c)) return rawOf(nd, '파이프(|)로 잇는 명령');

      // ---- ECHO (화면 출력 · 로그 기록)
      var em = /^ECHO(?:([.:(;,+\/\[\]=])|\s|$)/i.exec(c);
      if (em) {
        var text = c.length > 4 ? c.slice(5) : '';
        if (c.length === 4 || (!em[1] && /^(ON|OFF)$/i.test(text.trim()))) return rawOf(nd, 'ECHO ' + (text.trim().toUpperCase() || '(상태 보기)'));
        text = unesc(text);
        if (!R.redirs.length) { var vm = RE_VAR_ONLY.exec(text); return vm ? mk('echovar', { name: vm[1] }) : mk('echo', { text: text }); }
        if (R.redirs.length === 1 && files.length === 1 && files[0].op === '>>' && files[0].fd === '1') {
          var tm = /^\[%DATE% %TIME:~0,8%\] ?/.exec(text);
          return mk('log', { file: unq(files[0].to), text: tm ? text.slice(tm[0].length) : text, time: tm ? 'y' : 'n' });
        }
        if (!files.length) return mk('echo', { text: text });
        return rawOf(nd, files[0].op === '>' ? 'ECHO 를 파일에 덮어쓰기(>)' : 'ECHO 출력 돌리기');
      }
      if (files.length) return rawOf(nd, (w || '명령') + ' 결과를 파일로 보내기(> >> <)');

      var A = args(c).slice(1), pos = A.filter(function (x) { return !isFlag(x); }), flags = [];
      A.filter(isFlag).forEach(function (x) { flags = flags.concat(x.toUpperCase().match(/\/[^\/]+/g) || []); });
      function only(list) { return flags.every(function (f) { return list.indexOf(f) >= 0; }); }
      var m;
      switch (w) {
        case 'PAUSE': if (!A.length) return mk('pause'); break;
        case 'CLS': if (!A.length) return mk('cls'); break;
        case 'TITLE': return mk('title', { text: unesc(c.slice(6)) });
        case 'TIMEOUT': {
          var ti = flags.indexOf('/T') >= 0 ? A[A.map(function (x) { return x.toUpperCase(); }).indexOf('/T') + 1] : pos[0];
          if (only(['/T', '/NOBREAK']) && pos.length === 1 && /^\d+$/.test(ti || '')) return mk('timeout', { sec: ti });
          break;
        }
        case 'PING':
          if ((m = /^PING(?:\.EXE)?\s+(?:-n\s+(\d+)\s+)?(?:127\.0\.0\.1|localhost)(?:\s+-n\s+(\d+))?$/i.exec(c)) && +(m[1] || m[2]) >= 2) return mk('timeout', { sec: String(+(m[1] || m[2]) - 1) });
          break;
        case 'EXIT':
          if ((m = /^EXIT\s+\/B(?:\s+(-?\d+))?$/i.exec(c))) return mk('exitb', { code: m[1] || '0' });
          return rawOf(nd, 'EXIT (창까지 닫기)');
        case 'GOTO':
          if ((m = /^GOTO\s+:?(\S+)$/i.exec(c))) return /^EOF$/i.test(m[1]) ? mk('exitb', { code: '0' }) : mk('goto', { name: m[1] });
          break;
        case 'CALL':
          if ((m = /^CALL\s+:(\S+)\s*(.*)$/i.exec(c))) return mk('callsub', { name: m[1], args: m[2] });
          if ((m = /^CALL\s+("[^"]+"|\S+)$/i.exec(c))) return mk('callbat', { path: unq(m[1]) });
          return rawOf(nd, 'CALL + 넘길 값');
        case 'SET': {
          var rest = c.slice(3).replace(/^\s+/, '');
          if ((m = /^\/A\s+(.*)$/i.exec(rest))) {
            var ex = m[1].trim(); if (/^".*"$/.test(ex)) ex = ex.slice(1, -1);
            var am = new RegExp('^(' + VAR_NAME + ')\\s*([-+*/&|^]|%%|<<|>>)?=\\s*(.+)$').exec(ex);
            if (am && ex.indexOf(',') < 0) {
              var rhs = am[3].trim();
              var expr = am[2] ? am[1] + am[2] + (/[-+*/%&|^<>]/.test(rhs) ? '(' + rhs + ')' : rhs) : rhs;
              return mk('setcalc', { name: am[1], expr: expr });
            }
            return rawOf(nd, 'SET /A 여러 개 계산');
          }
          if ((m = /^\/P\s+(.*)$/i.exec(rest))) {
            var pv = m[1].trim(), pq = /^".*"$/.test(pv);
            if (pq) pv = pv.slice(1, -1);
            else if (!R.redirs.length) pv = nd.t.replace(/^[\s@]*SET\s+\/P\s+/i, '');
            var pk = pv.indexOf('=');
            if (pk > 0 && RE_NAME.test(pv.slice(0, pk)) && (pq || pv.slice(pk + 1).indexOf('"') < 0)) return mk('setinput', { name: pv.slice(0, pk), prompt: pq ? pctUn(pv.slice(pk + 1)) : unesc(pv.slice(pk + 1)) });
            return rawOf(nd, 'SET /P 형식');
          }
          var sq = /^".*"$/.test(rest), body = sq ? rest.slice(1, -1) : rest, k2 = body.indexOf('=');
          if (k2 > 0 && RE_NAME.test(body.slice(0, k2)) && body.slice(k2 + 1).indexOf('"') < 0)
            return mk('setvar', { name: body.slice(0, k2), value: sq ? pctUn(body.slice(k2 + 1)) : unesc(body.slice(k2 + 1)) });
          return rawOf(nd, 'SET 형식');
        }
        case 'CD': case 'CHDIR':
          if ((m = /^(?:CD|CHDIR)(?:\s+\/D)?\s+([^\/].*)$/i.exec(c))) return mk('cd', { path: unq(m[1]) });
          break;
        case 'MKDIR': case 'MD': if (!flags.length && pos.length === 1) return mk('mkdir', { path: unq(pos[0]) }); break;
        case 'RMDIR': case 'RD': if (flags.indexOf('/S') >= 0 && flags.indexOf('/Q') >= 0 && only(['/S', '/Q']) && pos.length === 1) return mk('rmdir', { path: unq(pos[0]) }); break;
        case 'DEL': case 'ERASE': if (only(['/F', '/Q']) && pos.length === 1) return mk('del', { path: unq(pos[0]) }); break;
        case 'COPY': if (only(['/Y']) && pos.length === 2) return mk('copy', { src: unq(pos[0]), dst: unq(pos[1]) }); break;
        case 'MOVE': if (only(['/Y']) && pos.length === 2) return mk('move', { src: unq(pos[0]), dst: unq(pos[1]) }); break;
        case 'REN': case 'RENAME': if (!flags.length && pos.length === 2) return mk('ren', { path: unq(pos[0]), newname: unq(pos[1]) }); break;
        case 'XCOPY': if (flags.indexOf('/E') >= 0 && only(['/E', '/S', '/I', '/H', '/Y', '/Q']) && pos.length === 2) return mk('xcopy', { src: unq(pos[0]), dst: unq(pos[1]) }); break;
        case 'FORFILES': {
          var fo = { p: '.', s: false, m: '*', d: '', c: '' }, ok = true;
          for (var i2 = 0; i2 < A.length; i2++) {
            var f2 = A[i2].toUpperCase();
            if (f2 === '/P') fo.p = unq(A[++i2]); else if (f2 === '/S') fo.s = true; else if (f2 === '/M') fo.m = unq(A[++i2]);
            else if (f2 === '/D') fo.d = A[++i2] || ''; else if (f2 === '/C') fo.c = unq(A[++i2]); else ok = false;
          }
          var dd = /^-(\d+)$/.exec(fo.d), cc = /^CMD\s+\/C\s+(?:IF\s+@ISDIR==FALSE\s+)?(?:DEL|ERASE)(?:\s+\/[FQ])*\s+@PATH$/i.test(fo.c);
          if (ok && dd && cc && fo.p) return mk('delold', { path: fo.p, mask: fo.m, days: dd[1], sub: fo.s ? 'y' : 'n' });
          return rawOf(nd, 'FORFILES 형식');
        }
        case 'POWERSHELL': case 'POWERSHELL.EXE':
          if ((m = /^POWERSHELL(?:\.EXE)?\s+(?:-NoProfile\s+)?(?:-ExecutionPolicy\s+\S+\s+)?-Command\s+"\s*Compress-Archive\s+-Path\s+('(?:[^']|'')*'|[^\s']+)\s+-DestinationPath\s+('(?:[^']|'')*'|[^\s']+)(?:\s+-Force)?\s*"$/i.exec(c))) {
            var ps = function (x) { return /^'.*'$/.test(x) ? x.slice(1, -1).replace(/''/g, "'") : x; };
            return mk('zip', { src: ps(m[1]), dst: ps(m[2]) });
          }
          return rawOf(nd, 'POWERSHELL 명령');
        case 'START': {
          var sa = A.slice(), wait = false;
          if (sa.length && /^"/.test(sa[0])) sa.shift();               // 첫 따옴표 = 창 제목
          while (sa.length && isFlag(sa[0])) {
            var fl = sa.shift().toUpperCase();
            if (fl === '/WAIT') wait = true; else return rawOf(nd, 'START ' + fl);
          }
          if (sa.length) return mk('run', { path: unq(sa.shift()), args: sa.join(' '), wait: wait ? 'y' : 'n' });
          break;
        }
        case 'TASKKILL': {
          var im = '', force = false, other = false;
          for (var i3 = 0; i3 < A.length; i3++) {
            var u3 = A[i3].toUpperCase();
            if (u3 === '/F') force = true; else if (u3 === '/IM') im = unq(A[++i3] || ''); else other = true;
          }
          if (force && im && !other) return mk('kill', { name: im });
          return rawOf(nd, 'TASKKILL 옵션');
        }
        case 'SETLOCAL': case 'ENDLOCAL':
          if (!inParen) return null;
          break;
      }
      if (!w) return rawOf(nd, '프로그램 직접 실행');
      return rawOf(nd, ['PAUSE', 'CLS', 'TIMEOUT', 'PING', 'GOTO', 'CD', 'CHDIR', 'MKDIR', 'MD', 'RMDIR', 'RD', 'DEL', 'ERASE', 'COPY', 'MOVE', 'REN', 'RENAME', 'XCOPY', 'START']
        .indexOf(w) >= 0 ? w + ' 옵션 ' + (flags.join(' ') || '형식') : '블록에 없는 명령 ' + w);
    }

    // ---- 맨 위 · 맨 아래 · 함수 영역 정리
    function isTerm(nd) { return /^(EXIT(\s+\/B)?(\s+-?\d+)?|GOTO\s+:?EOF)$/i.test(cmdOf(nd)); }
    function termCode(nd) { var mm = /(-?\d+)$/.exec(cmdOf(nd)); return mm ? +mm[1] : 0; }
    function nextIdx(list, i) { for (var k = i + 1; k < list.length; k++) if (list[k].k !== 'blank' && list[k].k !== 'comment') return k; return -1; }
    function adminAt(list, h) {
      var nd = list[h], chk = /^(NET\s+SESSION|FLTMC|OPENFILES)$/i;
      if (nd.k === 'chain' && nd.ops[0] === '||' && chk.test(cmdOf(nd.items[0])) && /runas/i.test(P.raw(nd))) { list.splice(h, 1); return true; }
      if (chk.test(cmdOf(nd))) {
        var k = h + 1;
        while (k < list.length && list[k].k === 'blank') k++;
        var nx = list[k];
        if (nx && nx.k === 'if' && okFail(errLevelCond(nx.cond)) === 'fail' && /runas/i.test(P.raw(nx))) { list.splice(h, k - h + 1); return true; }
      }
      return false;
    }
    function isSelfDel(nd) {
      var r = P.raw(nd).replace(/\s+/g, ' ').trim();
      return /^\(\s?GOTO\s?\)\s?2>\s?NUL\s?&\s?DEL\s+(\/[FQ]\s+)*"?%~f0"?$/i.test(r) || /^DEL\s+(\/[FQ]\s+)*"?%~f0"?$/i.test(r);
    }

    var top = P.nodes, main = top, fnodes = [];
    for (var i = 0; i < top.length; i++) {
      var sd = isSelfDel(top[i]);                 // 자기 삭제도 거기서 끝나므로 함수 영역의 시작으로 봄
      if (!sd && !isTerm(top[i])) continue;
      var nx = nextIdx(top, i);
      if (nx >= 0 && top[nx].k === 'label') {
        main = top.slice(0, i);
        if (sd || termCode(top[i])) main.push(top[i]);
        fnodes = top.slice(i + 1);
        break;
      }
    }
    main = main.filter(function (nd) { return !/^(SETLOCAL\b.*|ENDLOCAL)$/i.test(cmdOf(nd)); });

    // 맨 위: @ECHO OFF, CHCP, 이 폴더에서 시작, 관리자 재실행 → 옵션
    for (var h = 0; h < main.length;) {
      var hn = main[h], hc = cmdOf(hn);
      if (hn.k === 'blank' || hn.k === 'comment' || /^TITLE\s/i.test(hc)) { h++; continue; }
      if (/^ECHO\s+OFF$/i.test(hc)) { opt.echoOff = true; main.splice(h, 1); continue; }
      if (/^CHCP\s+65001$/i.test(hc)) { opt.utf8 = true; main.splice(h, 1); continue; }
      if (/^CHCP\s+949$/i.test(hc)) { main.splice(h, 1); continue; }
      if (/^(CD|CHDIR|PUSHD)(\s+\/D)?\s+"?%~dp0"?\\?$/i.test(hc)) { opt.cdSelf = true; main.splice(h, 1); continue; }
      if (adminAt(main, h)) { opt.admin = true; continue; }
      break;
    }
    // 맨 아래: (끝내기) → 자기 삭제 → PAUSE → 옵션
    var j = main.length - 1;
    var back = function () { while (j >= 0 && main[j].k === 'blank') j--; };
    back();
    if (j >= 0 && /^(EXIT(\s+\/B)?(\s+0)?|GOTO\s+:?EOF)$/i.test(cmdOf(main[j]))) { main.splice(j, 1); j--; back(); }
    if (j >= 0 && isSelfDel(main[j])) { opt.selfDel = true; main.splice(j, 1); j--; back(); }
    if (j >= 0 && /^PAUSE$/i.test(cmdOf(main[j]))) { opt.pauseEnd = true; main.splice(j, 1); }

    // 함수: 라벨 ~ GOTO :EOF / EXIT /B. 끝내기 없이 다음 라벨로 이어지면 그 라벨은 함수 안의 지점
    var funcs = [], cur = null, ended = true, pending = [];
    fnodes.forEach(function (nd) {
      if (nd.k === 'label' && ended) { cur = { name: nd.t, nodes: pending }; pending = []; funcs.push(cur); ended = false; return; }
      if (ended) { if (nd.k === 'comment') pending.push(nd); else if (nd.k !== 'blank' && cur) cur.nodes.push(nd); return; }
      if (isTerm(nd)) { if (termCode(nd)) cur.nodes.push(nd); ended = true; return; }
      cur.nodes.push(nd);
    });
    if (pending.length && cur) cur.nodes = cur.nodes.concat(pending);

    var blocks = convList(main, false);
    funcs.forEach(function (f) { blocks.push(mk('func', { name: f.name }, convList(f.nodes, false))); });

    // 마무리: 원본 줄 번호 붙이기, 지연 확장 원본이면 !변수! → %변수% (생성할 때 필요하면 다시 바꿈)
    var rawCount = 0;
    (function fin(list) {
      list.forEach(function (b) {
        if (b._from) {
          b.src = String(b._from) + (b._to > b._from ? '~' + b._to : '');
          b.why = b._why;
          delete b._from; delete b._to; delete b._why;
          rawCount++;
        }
        if (delayed) Object.keys(b.fields).forEach(function (k) { if (typeof b.fields[k] === 'string') b.fields[k] = b.fields[k].replace(RE_BANG, '%$1%'); });
        if (b.children) fin(b.children);
        if (b.elseChildren) fin(b.elseChildren);
      });
    })(blocks);

    return { blocks: blocks, options: opt, lines: P.lines, raw: rawCount, quiet: quiet };
  }

  window.BatchImport = { parse: parse };
})();
