/*
 * 배치파일 블록 조립기 — 블록 정의 · 편집기 · 코드 생성
 * assets/menu.js, assets/layout.js 가 먼저 로드된 뒤에 실행됩니다 (window.Portal 사용).
 * 새 블록을 추가하려면 아래 BLOCK_DEFS 에 한 줄 추가하면 팔레트·코드 생성에 자동 반영됩니다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Portal.esc;

  // ================= 블록 정의 =================
  var BLOCK_DEFS = {
    echo:    { cat:'basic', short:'화면출력', label:['화면에 ', {f:'text'}, ' 출력'], fields:{ text:{type:'text', default:'안녕하세요'} }, gen:function(f){ return 'ECHO ' + f.text; } },
    comment: { cat:'basic', short:'메모', label:['메모: ', {f:'text'}], fields:{ text:{type:'text', default:'설명을 입력하세요'} }, gen:function(f){ return 'REM ' + f.text; } },
    blank:   { cat:'basic', short:'빈 줄', label:['빈 줄 추가'], fields:{}, gen:function(){ return ''; } },
    cls:     { cat:'basic', short:'화면지우기', label:['화면 지우기'], fields:{}, gen:function(){ return 'CLS'; } },
    pause:   { cat:'basic', short:'일시정지', label:['아무 키나 누르면 계속'], fields:{}, gen:function(){ return 'PAUSE'; } },
    timeout: { cat:'basic', short:'대기', label:[{f:'sec'}, '초 기다리기'], fields:{ sec:{type:'number', default:3} }, gen:function(f){ return 'TIMEOUT /T ' + f.sec + ' > nul'; } },
    title:   { cat:'basic', short:'창제목', label:['창 제목을 ', {f:'text'}, '(으)로 설정'], fields:{ text:{type:'text', default:'내 배치파일'} }, gen:function(f){ return 'TITLE ' + f.text; } },
    exitb:   { cat:'basic', short:'종료', label:['배치파일 종료 (코드 ', {f:'code'}, ')'], fields:{ code:{type:'number', default:0} }, gen:function(f){ return 'EXIT /B ' + f.code; } },

    setvar:  { cat:'var', short:'변수설정', label:['변수 ', {f:'name'}, ' 을(를) ', {f:'value'}, ' (으)로 설정'], fields:{ name:{type:'text', default:'MYVAR'}, value:{type:'text', default:'값'} }, gen:function(f){ return 'SET "' + f.name + '=' + f.value + '"'; } },
    setcalc: { cat:'var', short:'변수계산', label:['변수 ', {f:'name'}, ' 을(를) 계산식 ', {f:'expr'}, ' 결과로 설정'], fields:{ name:{type:'text', default:'NUM'}, expr:{type:'text', default:'1+1'} }, gen:function(f){ return 'SET /A "' + f.name + '=' + f.expr + '"'; } },
    setinput:{ cat:'var', short:'입력받기', label:['"', {f:'prompt'}, '" 라고 물어보고 대답을 변수 ', {f:'name'}, '에 저장'], fields:{ prompt:{type:'text', default:'값을 입력하세요: '}, name:{type:'text', default:'ANSWER'} }, gen:function(f){ return 'SET /P "' + f.name + '=' + f.prompt + '"'; } },
    echovar: { cat:'var', short:'변수출력', label:['변수 ', {f:'name'}, ' 값 출력'], fields:{ name:{type:'text', default:'MYVAR'} }, gen:function(f){ return 'ECHO %' + f.name + '%'; } },

    cd:    { cat:'file', short:'폴더이동', label:['폴더로 이동: ', {f:'path'}], fields:{ path:{type:'text', default:'C:\\work'} }, gen:function(f){ return 'CD /D "' + f.path + '"'; } },
    mkdir: { cat:'file', short:'폴더생성', label:['폴더 만들기: ', {f:'path'}], fields:{ path:{type:'text', default:'backup'} }, gen:function(f){ return 'IF NOT EXIST "' + f.path + '" MKDIR "' + f.path + '"'; } },
    rmdir: { cat:'file', short:'폴더삭제', label:['폴더 삭제(하위 파일 포함): ', {f:'path'}], fields:{ path:{type:'text', default:'temp'} }, gen:function(f){ return 'RMDIR /S /Q "' + f.path + '"'; } },
    copy:  { cat:'file', short:'파일복사', label:['파일 복사: ', {f:'src'}, ' → ', {f:'dst'}], fields:{ src:{type:'text', default:'*.txt'}, dst:{type:'text', default:'backup\\'} }, gen:function(f){ return 'COPY /Y "' + f.src + '" "' + f.dst + '"'; } },
    move:  { cat:'file', short:'파일이동', label:['파일/폴더 이동: ', {f:'src'}, ' → ', {f:'dst'}], fields:{ src:{type:'text', default:'*.log'}, dst:{type:'text', default:'archive\\'} }, gen:function(f){ return 'MOVE /Y "' + f.src + '" "' + f.dst + '"'; } },
    del:   { cat:'file', short:'파일삭제', label:['파일 삭제: ', {f:'path'}], fields:{ path:{type:'text', default:'*.tmp'} }, gen:function(f){ return 'DEL /F /Q "' + f.path + '"'; } },
    ren:   { cat:'file', short:'이름변경', label:['이름 바꾸기: ', {f:'path'}, ' → ', {f:'newname'}], fields:{ path:{type:'text', default:'old.txt'}, newname:{type:'text', default:'new.txt'} }, gen:function(f){ return 'REN "' + f.path + '" "' + f.newname + '"'; } },

    run:     { cat:'run', short:'프로그램실행', label:['프로그램 실행: ', {f:'path'}, ' (인자: ', {f:'args'}, ')'], fields:{ path:{type:'text', default:'notepad.exe'}, args:{type:'text', default:''} }, gen:function(f){ return ('START "" "' + f.path + '" ' + f.args).trim(); } },
    runcmd:  { cat:'run', short:'명령실행', label:['명령어 직접 입력: ', {f:'cmd'}], fields:{ cmd:{type:'text', default:'ipconfig /all'} }, gen:function(f){ return f.cmd; } },
    callbat: { cat:'run', short:'배치호출', label:['다른 배치파일 실행: ', {f:'path'}], fields:{ path:{type:'text', default:'other.bat'} }, gen:function(f){ return 'CALL "' + f.path + '"'; } },
    runas:   { cat:'run', short:'관리자 재실행', label:['관리자 권한이 아니면 "', {f:'msg'}, '" 라고 알리고 관리자 권한으로 다시 실행'], fields:{ msg:{type:'text', default:'관리자 권한이 필요합니다. 다시 시작합니다...'} },
              gen:function (f) {
                return 'NET SESSION >nul 2>&1\n' +
                       'IF %ERRORLEVEL% NEQ 0 (\n' +
                       '    ECHO ' + f.msg + '\n' +
                       '    POWERSHELL -Command "Start-Process \'%~f0\' -Verb RunAs"\n' +
                       '    EXIT /B\n' +
                       ')';
              } },
    selfdel: { cat:'run', short:'내 파일 삭제', label:['이 배치파일 자기 자신을 삭제하기 (맨 마지막 줄에 두세요)'], fields:{}, gen:function () { return '(goto) 2>nul & del "%~f0"'; } },

    label: { cat:'jump', short:'라벨', label:['지점(라벨) 만들기: ', {f:'name'}], fields:{ name:{type:'text', default:'START'} }, gen:function(f){ return ':' + f.name; } },
    goto:  { cat:'jump', short:'이동(goto)', label:['해당 지점으로 이동: ', {f:'name'}], fields:{ name:{type:'text', default:'START'} }, gen:function(f){ return 'GOTO ' + f.name; } },

    if_exist:     { cat:'flow', container:true, hasElse:true, short:'만약 있으면', label:['만약 파일/폴더가 있으면: ', {f:'path'}], fields:{ path:{type:'text', default:'data.txt'} }, genOpen:function(f){ return 'IF EXIST "' + f.path + '" ('; }, genElse:function(){ return ') ELSE ('; }, genClose:function(){ return ')'; } },
    if_not_exist: { cat:'flow', container:true, hasElse:true, short:'만약 없으면', label:['만약 파일/폴더가 없으면: ', {f:'path'}], fields:{ path:{type:'text', default:'data.txt'} }, genOpen:function(f){ return 'IF NOT EXIST "' + f.path + '" ('; }, genElse:function(){ return ') ELSE ('; }, genClose:function(){ return ')'; } },
    if_eq:        { cat:'flow', container:true, hasElse:true, short:'만약 같으면', label:['만약 변수 ', {f:'name'}, ' 이(가) ', {f:'value'}, ' 와(과) 같으면'], fields:{ name:{type:'text', default:'ANSWER'}, value:{type:'text', default:'y'} }, genOpen:function(f){ return 'IF "%' + f.name + '%"=="' + f.value + '" ('; }, genElse:function(){ return ') ELSE ('; }, genClose:function(){ return ')'; } },
    for_files:    { cat:'flow', container:true, short:'파일마다 반복', label:['폴더 ', {f:'dir'}, ' 안의 ', {f:'pattern'}, ' 파일마다 반복 (파일명: %%', {f:'v'}, ')'], fields:{ dir:{type:'text', default:'.'}, pattern:{type:'text', default:'*.txt'}, v:{type:'text', default:'F'} }, genOpen:function(f){ return 'FOR %%' + f.v + ' IN ("' + f.dir + '\\' + f.pattern + '") DO ('; }, genClose:function(){ return ')'; } },
    for_count:    { cat:'flow', container:true, short:'숫자만큼 반복', label:[{f:'from'}, '부터 ', {f:'to'}, '까지 ', {f:'step'}, '씩 반복 (변수: %%', {f:'v'}, ')'], fields:{ from:{type:'number', default:1}, to:{type:'number', default:10}, step:{type:'number', default:1}, v:{type:'text', default:'i'} }, genOpen:function(f){ return 'FOR /L %%' + f.v + ' IN (' + f.from + ',' + f.step + ',' + f.to + ') DO ('; }, genClose:function(){ return ')'; } }
  };

  var CATS = [
    { id:'basic', name:'기본' },
    { id:'var',   name:'변수' },
    { id:'file',  name:'파일 · 폴더' },
    { id:'flow',  name:'조건 · 반복' },
    { id:'run',   name:'실행' },
    { id:'jump',  name:'이동(라벨)' }
  ];

  // ================= 블록 트리 유틸 =================
  var uid = 1;
  function newId() { return 'b' + (uid++) + '_' + Math.random().toString(36).slice(2, 7); }

  function createBlock(type) {
    var def = BLOCK_DEFS[type];
    var fields = {};
    Object.keys(def.fields || {}).forEach(function (k) { fields[k] = def.fields[k].default; });
    var block = { id: newId(), type: type, fields: fields };
    if (def.container) {
      block.children = [];
      if (def.hasElse) { block.elseChildren = []; block.showElse = false; }
    }
    return block;
  }

  function duplicateBlock(b) {
    var copy = { id: newId(), type: b.type, fields: Object.assign({}, b.fields) };
    if (b.children) copy.children = b.children.map(duplicateBlock);
    if (b.elseChildren) { copy.elseChildren = b.elseChildren.map(duplicateBlock); copy.showElse = b.showElse; }
    return copy;
  }

  function sanitize(ws) {
    function fix(list) {
      if (!Array.isArray(list)) return [];
      var out = [];
      list.forEach(function (b) {
        if (!b || !BLOCK_DEFS[b.type]) return;
        var def = BLOCK_DEFS[b.type];
        var fields = {};
        Object.keys(def.fields || {}).forEach(function (k) { fields[k] = def.fields[k].default; });
        if (b.fields) Object.keys(b.fields).forEach(function (k) { if (k in fields) fields[k] = b.fields[k]; });
        var nb = { id: b.id || newId(), type: b.type, fields: fields };
        if (def.container) {
          nb.children = fix(b.children);
          if (def.hasElse) { nb.elseChildren = fix(b.elseChildren); nb.showElse = !!b.showElse; }
        }
        out.push(nb);
      });
      return out;
    }
    return { blocks: fix(ws && ws.blocks) };
  }

  function removeById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        var removed = list.splice(i, 1)[0];
        return { removed: removed, fromList: list, fromIndex: i };
      }
      var b = list[i], r;
      if (b.children) { r = removeById(b.children, id); if (r) return r; }
      if (b.elseChildren) { r = removeById(b.elseChildren, id); if (r) return r; }
    }
    return null;
  }

  function isSameOrDescendant(block, targetList) {
    if (block.children === targetList) return true;
    if (block.elseChildren === targetList) return true;
    var kids = (block.children || []).concat(block.elseChildren || []);
    return kids.some(function (c) { return isSameOrDescendant(c, targetList); });
  }

  function findListRef(rootArr, target) {
    if (rootArr === target) return true;
    return rootArr.some(function (b) {
      return (b.children && findListRef(b.children, target)) || (b.elseChildren && findListRef(b.elseChildren, target));
    });
  }

  // ================= 코드 생성 =================
  function genList(list, indent) {
    return list.map(function (b) { return genBlock(b, indent); }).join('\n');
  }
  function genBlock(b, indent) {
    var def = BLOCK_DEFS[b.type];
    var pad = '  '.repeat(indent);
    if (def.container) {
      var out = pad + def.genOpen(b.fields) + '\n';
      out += genList(b.children, indent + 1);
      if (def.hasElse && b.showElse) {
        out += '\n' + pad + def.genElse(b.fields) + '\n';
        out += genList(b.elseChildren, indent + 1);
      }
      out += '\n' + pad + def.genClose(b.fields);
      return out;
    }
    var line = def.gen(b.fields);
    if (line === '') return '';
    return line.split('\n').map(function (l) { return pad + l; }).join('\n');
  }
  // ================= 인코딩 =================
  // cmd.exe 는 BOM 을 이해하지 못하고(첫 줄 명령어가 깨짐), CHCP 가 없으면 파일을 시스템 코드페이지(한국어 윈도우: 949)로 읽습니다.
  // 그래서 기본값은 CP949 바이트로 직접 저장하고, UTF-8 모드는 BOM 없이 CHCP 65001 을 붙여 저장합니다.
  function getEncoding() { return $('optEncoding').value === 'utf8' ? 'utf8' : 'cp949'; }

  var cp949Table = null;
  function getCp949Table() {
    if (cp949Table !== null) return cp949Table;
    var dec;
    try { dec = new TextDecoder('euc-kr'); } catch (e) { cp949Table = false; return false; }
    var map = new Map(), buf = new Uint8Array(2);
    for (var lead = 0x81; lead <= 0xFE; lead++) {
      for (var trail = 0x41; trail <= 0xFE; trail++) {
        buf[0] = lead; buf[1] = trail;
        var s = dec.decode(buf);
        if (s.length === 1 && s !== '�' && !map.has(s)) map.set(s, (lead << 8) | trail);
      }
    }
    cp949Table = map;
    return map;
  }

  // 반환: { bytes: Uint8Array, bad: [CP949로 표현 못 하는 글자들] } / 브라우저 미지원 시 null
  function encodeCp949(str) {
    var out = [], bad = [], table = null;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { out.push(c); continue; }
      if (!table) { table = getCp949Table(); if (!table) return null; }
      var ch = str.charAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) { ch = str.substr(i, 2); i++; }
      var code = table.get(ch);
      if (code === undefined) { out.push(0x3F); if (bad.indexOf(ch) < 0) bad.push(ch); }
      else out.push(code >> 8, code & 0xFF);
    }
    return { bytes: new Uint8Array(out), bad: bad };
  }

  function generateCode() {
    var lines = [];
    if ($('optEchoOff').checked) lines.push('@ECHO OFF');
    if (getEncoding() === 'utf8') lines.push('CHCP 65001 > nul');
    lines.push('');
    var body = genList(workspace.blocks, 0);
    if (body) lines.push(body);
    if ($('optPauseEnd').checked) { lines.push(''); lines.push('PAUSE'); }
    return (lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n');
  }

  function highlightBat(code) {
    var KW = 'ECHO|SET|IF|ELSE|EXIST|NOT|FOR|IN|DO|GOTO|CALL|EXIT|CLS|PAUSE|TITLE|START|COPY|MOVE|DEL|REN|MKDIR|RMDIR|TIMEOUT|CHCP|CD|EQU|NEQ|NET|SESSION|ERRORLEVEL|POWERSHELL|VERB|RUNAS';
    var re = new RegExp('(^[ \\t]*(?:REM|::).*$)|("[^"]*")|(%%?[A-Za-z_][\\w]*%?)|\\b(' + KW + ')\\b', 'gmi');
    var out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      var cls = m[1] ? 'cm' : m[2] ? 'str' : m[3] ? 'fn' : 'kw';
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  // ================= 상태 =================
  var workspace = sanitize(Portal.store.get('workspace', { blocks: [] }));
  var activeList = workspace.blocks;
  var activeListLabel = '전체(맨 끝)';
  var dragPayload = null;
  var genTimer = null, saveTimer = null;

  function scheduleGen() { clearTimeout(genTimer); genTimer = setTimeout(refreshCode, 150); }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { Portal.store.set('workspace', workspace); }, 400); }
  function refreshCode() {
    var code = generateCode();
    $('out').innerHTML = highlightBat(code);
    $('out').dataset.raw = code;
    updateEncodingWarning(code);
  }
  function updateEncodingWarning(code) {
    var box = $('encWarn');
    var bad = [];
    if (getEncoding() === 'cp949') {
      var r = encodeCp949(code);
      if (r) bad = r.bad;
    }
    if (bad.length) {
      box.textContent = '⚠ ANSI(CP949)로 저장할 수 없는 글자가 있어 ?로 바뀝니다: ' +
        bad.slice(0, 10).join(' ') + (bad.length > 10 ? ' …' : '') +
        '  →  이 글자들이 꼭 필요하면 "한글 저장 방식"을 UTF-8로 바꾸세요.';
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }
  function saveAndRender() {
    if (!findListRef(workspace.blocks, activeList)) { activeList = workspace.blocks; activeListLabel = '전체(맨 끝)'; }
    Portal.store.set('workspace', workspace);
    renderWorkspace();
    refreshCode();
    $('targetLabel').textContent = activeListLabel;
  }

  // ================= DOM 헬퍼 =================
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      if (Array.isArray(kid)) kid.forEach(function (k2) { if (k2 != null) e.appendChild(k2.nodeType ? k2 : document.createTextNode(k2)); });
      else e.appendChild(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return e;
  }
  function autoGrow(input, isNum) {
    if (isNum) { input.style.width = '58px'; return; }
    input.style.width = Math.max(60, Math.min(240, String(input.value).length * 7.5 + 28)) + 'px';
  }
  function clearDropHints() {
    document.querySelectorAll('.drop-before,.drop-after').forEach(function (el) { el.classList.remove('drop-before', 'drop-after'); });
    document.querySelectorAll('.blk-empty.drop-active,.blk-tail.drop-active').forEach(function (el) { el.classList.remove('drop-active'); });
  }

  function handleDrop(targetList, targetIndex) {
    if (!dragPayload) return;
    if (dragPayload.kind === 'palette') {
      targetList.splice(targetIndex, 0, createBlock(dragPayload.blockType));
    } else if (dragPayload.kind === 'move') {
      var block = dragPayload.block;
      if (isSameOrDescendant(block, targetList)) { dragPayload = null; return; }
      var removal = removeById(workspace.blocks, block.id);
      var idx = targetIndex;
      if (removal && removal.fromList === targetList && removal.fromIndex < idx) idx -= 1;
      targetList.splice(idx, 0, block);
    }
    dragPayload = null;
    saveAndRender();
  }

  // ================= 렌더링 =================
  function renderRow(block, list, idx, depth) {
    var def = BLOCK_DEFS[block.type];
    var row = h('div', {
      class: 'blk-row cat-' + def.cat, draggable: 'true',
      ondragstart: function (e) {
        dragPayload = { kind: 'move', block: block };
        e.dataTransfer.setData('text/plain', block.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(function () { row.classList.add('dragging'); }, 0);
      },
      ondragend: function () { row.classList.remove('dragging'); clearDropHints(); },
      ondragover: function (e) {
        e.preventDefault(); e.stopPropagation();
        var r = row.getBoundingClientRect();
        var before = (e.clientY - r.top) < r.height / 2;
        clearDropHints();
        row.classList.add(before ? 'drop-before' : 'drop-after');
      },
      ondragleave: function () { row.classList.remove('drop-before', 'drop-after'); },
      ondrop: function (e) {
        e.preventDefault(); e.stopPropagation();
        var r = row.getBoundingClientRect();
        var before = (e.clientY - r.top) < r.height / 2;
        clearDropHints();
        handleDrop(list, before ? idx : idx + 1);
      }
    });

    var head = h('div', { class: 'blk-head' });
    head.appendChild(h('span', { class: 'blk-handle', title: '드래그해서 이동' }, '⠿'));
    var label = h('span', { class: 'blk-label' });
    def.label.forEach(function (seg) {
      if (typeof seg === 'string') { label.appendChild(document.createTextNode(seg)); return; }
      var fdef = def.fields[seg.f];
      var isNum = fdef.type === 'number';
      var input = h('input', {
        type: isNum ? 'number' : 'text',
        class: 'blk-field',
        onclick: function (e) { e.stopPropagation(); },
        onmousedown: function (e) { e.stopPropagation(); },
        oninput: function (e) { block.fields[seg.f] = e.target.value; autoGrow(input, isNum); scheduleGen(); scheduleSave(); }
      });
      input.value = block.fields[seg.f];
      autoGrow(input, isNum);
      label.appendChild(input);
    });
    head.appendChild(label);

    var actions = h('div', { class: 'blk-actions' });
    actions.appendChild(h('button', { class: 'blk-btn', title: '위로', type: 'button', onclick: function (e) { e.stopPropagation(); if (idx > 0) { var t = list[idx - 1]; list[idx - 1] = list[idx]; list[idx] = t; saveAndRender(); } } }, '▲'));
    actions.appendChild(h('button', { class: 'blk-btn', title: '아래로', type: 'button', onclick: function (e) { e.stopPropagation(); if (idx < list.length - 1) { var t = list[idx + 1]; list[idx + 1] = list[idx]; list[idx] = t; saveAndRender(); } } }, '▼'));
    actions.appendChild(h('button', { class: 'blk-btn', title: '복제', type: 'button', onclick: function (e) { e.stopPropagation(); list.splice(idx + 1, 0, duplicateBlock(block)); saveAndRender(); } }, '⧉'));
    if (def.hasElse) {
      actions.appendChild(h('button', { class: 'blk-btn', title: 'else 토글', type: 'button', onclick: function (e) { e.stopPropagation(); block.showElse = !block.showElse; saveAndRender(); } }, block.showElse ? 'else 제거' : '+else'));
    }
    actions.appendChild(h('button', { class: 'blk-btn danger', title: '삭제', type: 'button', onclick: function (e) { e.stopPropagation(); list.splice(idx, 1); saveAndRender(); } }, '✕'));
    head.appendChild(actions);
    row.appendChild(head);

    if (def.container) {
      var body = h('div', { class: 'blk-body' });
      body.appendChild(h('div', {
        class: 'blk-branch-tag',
        onclick: function () { activeList = block.children; activeListLabel = '"' + def.short + '" 안쪽 (그러면)'; saveAndRender(); }
      }, (def.hasElse ? '그러면' : '반복할 내용') + ' ▸ 여기에 추가'));
      body.appendChild(renderList(block.children, depth + 1));
      if (def.hasElse && block.showElse) {
        body.appendChild(h('div', {
          class: 'blk-branch-tag',
          onclick: function () { activeList = block.elseChildren; activeListLabel = '"' + def.short + '" 안쪽 (아니라면)'; saveAndRender(); }
        }, '아니라면 ▸ 여기에 추가'));
        body.appendChild(renderList(block.elseChildren, depth + 1));
      }
      row.appendChild(body);
    }
    return row;
  }

  function renderList(list, depth) {
    var wrap = h('div', { class: 'blk-list' + (list === activeList ? ' active-target' : '') });
    if (!list.length) {
      wrap.appendChild(h('div', {
        class: 'blk-empty',
        onclick: function () { activeList = list; activeListLabel = depth === 0 ? '전체(맨 끝)' : '선택한 위치'; saveAndRender(); },
        ondragover: function (e) { e.preventDefault(); e.stopPropagation(); wrap.querySelector('.blk-empty').classList.add('drop-active'); },
        ondragleave: function (e) { wrap.querySelector('.blk-empty').classList.remove('drop-active'); },
        ondrop: function (e) { e.preventDefault(); e.stopPropagation(); handleDrop(list, 0); }
      }, '여기를 클릭해서 추가 위치로 선택하거나, 블록을 끌어다 놓으세요'));
    } else {
      list.forEach(function (b, i) { wrap.appendChild(renderRow(b, list, i, depth)); });
    }
    return wrap;
  }

  function renderWorkspace() {
    var root = $('wsRoot');
    root.innerHTML = '';
    if (!workspace.blocks.length) {
      root.appendChild(h('div', { class: 'bb-empty-root' }, '왼쪽에서 블록을 클릭하거나 이곳으로 드래그해서 시작하세요.'));
    } else {
      root.appendChild(renderList(workspace.blocks, 0));
    }
    var tail = h('div', {
      class: 'blk-tail',
      ondragover: function (e) { e.preventDefault(); tail.classList.add('drop-active'); },
      ondragleave: function () { tail.classList.remove('drop-active'); },
      ondrop: function (e) { e.preventDefault(); tail.classList.remove('drop-active'); handleDrop(workspace.blocks, workspace.blocks.length); }
    }, '＋ 여기에 놓으면 맨 끝(전체)에 추가');
    root.appendChild(tail);
  }

  function renderPalette() {
    var root = $('palette');
    root.innerHTML = '';
    CATS.forEach(function (cat) {
      var typesInCat = Object.keys(BLOCK_DEFS).filter(function (k) { return BLOCK_DEFS[k].cat === cat.id; });
      if (!typesInCat.length) return;
      var sec = h('div', { class: 'pal-cat' });
      sec.appendChild(h('div', { class: 'pal-cat-title' }, cat.name));
      typesInCat.forEach(function (type) {
        var def = BLOCK_DEFS[type];
        var text = def.label.map(function (seg) {
          if (typeof seg === 'string') return seg;
          var v = def.fields[seg.f].default;
          return '[' + (v === '' ? ' ' : v) + ']';
        }).join('');
        var chip = h('div', {
          class: 'pal-chip cat-' + cat.id, draggable: 'true', title: text,
          ondragstart: function (e) { dragPayload = { kind: 'palette', blockType: type }; e.dataTransfer.setData('text/plain', type); e.dataTransfer.effectAllowed = 'copy'; },
          onclick: function () { activeList.push(createBlock(type)); saveAndRender(); }
        }, text);
        sec.appendChild(chip);
      });
      root.appendChild(sec);
    });
  }

  // ================= 툴바 동작 =================
  function loadSample() {
    if (workspace.blocks.length && !confirm('현재 작업 중인 내용이 예제로 바뀝니다. 계속할까요?')) return;
    var note = createBlock('comment'); note.fields.text = '이 배치파일은 log 파일을 backup 폴더로 정리합니다.';
    var mk = createBlock('mkdir'); mk.fields.path = 'backup';
    var forB = createBlock('for_files'); forB.fields.dir = '.'; forB.fields.pattern = '*.log'; forB.fields.v = 'F';
    var mv = createBlock('move'); mv.fields.src = '%%F'; mv.fields.dst = 'backup\\';
    forB.children.push(mv);
    var done = createBlock('echo'); done.fields.text = '정리가 끝났습니다.';
    workspace = { blocks: [note, mk, forB, done] };
    activeList = workspace.blocks; activeListLabel = '전체(맨 끝)';
    saveAndRender();
  }
  function resetWorkspace() {
    if (!confirm('모든 블록을 지우고 새로 시작할까요?')) return;
    workspace = { blocks: [] };
    activeList = workspace.blocks; activeListLabel = '전체(맨 끝)';
    saveAndRender();
  }
  function baseName() {
    var n = $('bbFilename').value.trim().replace(/\.(bat|cmd|json)$/i, '');
    return n || 'run';
  }

  $('btnSample').onclick = loadSample;
  $('btnReset').onclick = resetWorkspace;
  $('btnResetTarget').onclick = function () { activeList = workspace.blocks; activeListLabel = '전체(맨 끝)'; saveAndRender(); };
  $('btnCopy').onclick = function () { Portal.copy($('out').dataset.raw || '', this); };

  $('btnExport').onclick = function () {
    var blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = baseName() + '.json'; document.body.appendChild(a); a.click(); a.remove();
  };
  $('btnImportTrigger').onclick = function () { $('fileImport').click(); };
  $('fileImport').onchange = function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.blocks)) throw new Error('invalid');
        workspace = sanitize(data);
        activeList = workspace.blocks; activeListLabel = '전체(맨 끝)';
        saveAndRender();
      } catch (err) { alert('올바른 조립기 JSON 파일이 아닙니다.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  $('btnDownload').onclick = function () {
    // \uc904\ubc14\uafc8\uc740 CRLF \ub85c (LF \ub9cc \uc788\uc73c\uba74 GOTO/CALL :\ub77c\ubca8 \uc774 \uac00\ub054 \uc5c9\ub6b1\ud558\uac8c \ub3d9\uc791\ud569\ub2c8\ub2e4)
    var code = generateCode().replace(/\r?\n/g, '\r\n');
    var data;
    if (getEncoding() === 'cp949') {
      var r = encodeCp949(code);
      if (!r) { alert('\uc774 \ube0c\ub77c\uc6b0\uc800\ub294 ANSI(CP949) \uc800\uc7a5\uc744 \uc9c0\uc6d0\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. "\ud55c\uae00 \uc800\uc7a5 \ubc29\uc2dd"\uc744 UTF-8\ub85c \ubc14\uafd4 \uc8fc\uc138\uc694.'); return; }
      if (r.bad.length && !confirm('ANSI(CP949)\ub85c \ud45c\ud604\ud560 \uc218 \uc5c6\ub294 \uae00\uc790(' + r.bad.join(' ') + ')\ub294 ?\ub85c \ubc14\ub01d\ub2c8\ub2e4. \uadf8\ub798\ub3c4 \ubc1b\uc744\uae4c\uc694?\n\n\ucde8\uc18c\ud558\uace0 "\ud55c\uae00 \uc800\uc7a5 \ubc29\uc2dd"\uc744 UTF-8\ub85c \ubc14\uafb8\uba74 \uadf8\ub300\ub85c \uc800\uc7a5\ub429\ub2c8\ub2e4.')) return;
      data = r.bytes;
    } else {
      data = code; // UTF-8, BOM \uc5c6\uc774 \uc800\uc7a5 (BOM \uc774 \uc788\uc73c\uba74 cmd \uac00 \uccab \uc904\uc744 \uba85\ub839\uc5b4\ub85c \uc778\uc2dd\ud558\uc9c0 \ubabb\ud568)
    }
    var blob = new Blob([data], { type: 'application/octet-stream' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    var name = $('bbFilename').value.trim() || 'run.bat';
    if (!/\.(bat|cmd)$/i.test(name)) name += '.bat';
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  };

  document.getElementById('toolbarForm').addEventListener('input', scheduleGen);
  document.getElementById('toolbarForm').addEventListener('change', scheduleGen);
  document.addEventListener('dragend', clearDropHints);

  // ================= 시작 =================
  if (!$('bbFilename').value) $('bbFilename').value = 'run.bat';
  Portal.persist(document.getElementById('toolbarForm'));
  // 저장 방식은 따로도 기억해 둡니다 (Portal.persist 가 select 를 다루지 않는 경우 대비)
  $('optEncoding').value = Portal.store.get('encoding', 'cp949') === 'utf8' ? 'utf8' : 'cp949';
  $('optEncoding').addEventListener('change', function () { Portal.store.set('encoding', getEncoding()); });
  renderPalette();
  saveAndRender();
})();
