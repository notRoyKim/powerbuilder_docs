/*
 * 배치파일 블록 조립기 — 블록 정의 · 편집기 · 코드 생성
 * assets/menu.js, assets/layout.js 가 먼저 로드된 뒤에 실행됩니다 (window.Portal 사용).
 *
 * 새 블록은 BLOCK_DEFS 에 한 항목 추가하면 팔레트·코드 생성·검증에 자동 반영됩니다.
 *   필드: { type:'text'|'number'|'select'|'textarea', default, req(빈칸 금지), int(정수), v(변수 이름),
 *           loop(FOR 변수 한 글자), lbl(라벨·함수 이름 정의), ref(라벨·함수 이름 참조), opts:[[값, 표시]] }
 *   블록: gen(f, c) → 코드 문자열(여러 줄은 \n). c.inParen = 조건·반복 괄호 안인지
 *         container 블록은 genOpen(f, c) / genClose(f)(없으면 ')'), hasElse, paren:false(괄호 없는 함수)
 *         setsVar: 변수를 바꾸는 블록(조건·반복 안에 있으면 지연 확장을 자동으로 켭니다)
 *         tip: 팔레트·블록에 마우스를 올리면 보이는 설명, kw: 팔레트 검색어
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = Portal.esc;

  // ================= 코드 생성 보조 =================
  var G = { delayed: false };   // 지연 확장(!변수!) 사용 여부 — generate() 가 정합니다

  var VAR_CH = 'A-Za-z_\\u3131-\\uD79D', VAR_CH2 = '\\w\\u3131-\\uD79D';
  // 변수 참조가 아닌 % 한 개는 배치파일에서 사라지므로 %% 로 바꿉니다
  var PCT_RE = new RegExp('%%|%~[a-zA-Z]*[0-9*]|%[0-9*]|%[' + VAR_CH + '][' + VAR_CH2 + ']*(?::[^%\\n]*)?%|%', 'g');
  var VAR_RE = new RegExp('%([' + VAR_CH + '][' + VAR_CH2 + ']*(?::[^%\\n]*)?)%', 'g');

  function str(s) { return String(s == null ? '' : s); }
  function pct(s) { return str(s).replace(PCT_RE, function (m) { return m === '%' ? '%%' : m; }); }
  function unq(s) { return str(s).trim().replace(/^"+|"+$/g, ''); }           // 사용자가 넣은 바깥 따옴표 제거
  function q(s) { return '"' + unq(s) + '"'; }
  function noSlash(s) { var p = unq(s); return /^[A-Za-z]:\\?$/.test(p) ? p.charAt(0) + ':\\.' : p.replace(/\\+$/, ''); }
  function psq(s) { return "'" + unq(s).replace(/'/g, "''") + "'"; }        // PowerShell 작은따옴표 문자열
  function name(s) { return unq(s).replace(/^:/, ''); }
  // 따옴표 없이 쓰는 글자(ECHO·TITLE): 특수문자 이스케이프
  function txt(s, c) {
    s = pct(s).replace(/\^/g, '^^').replace(/[&|<>]/g, '^$&');
    if (c && c.inParen) s = s.replace(/\)/g, '^)');
    if (G.delayed) s = s.replace(/!/g, '^^!');
    return s;
  }
  // "..." 안에 쓰는 글자
  function qtxt(s) { s = pct(s).replace(/"/g, ''); return G.delayed ? s.replace(/!/g, '^!') : s; }
  function echoLine(s, c) { return str(s) === '' ? 'ECHO.' : 'ECHO ' + txt(s, c); }
  function runasCode(msg) {
    return 'NET SESSION > nul 2>&1\n' +
           'IF ERRORLEVEL 1 (\n' +
           '  ' + echoLine(msg, { inParen: true }) + '\n' +
           '  POWERSHELL -NoProfile -Command "Start-Process -FilePath \'%~f0\' -Verb RunAs"\n' +
           '  EXIT /B\n' +
           ')';
  }

  // ================= 블록 정의 =================
  var SUB = [['n', '(이 폴더만)'], ['y', '(하위 폴더까지)']];
  var IF_OPS = [['==', '와(과) 같으면'], ['!=', '와(과) 다르면'], ['GTR', '보다 크면 (숫자)'], ['GEQ', '이상이면 (숫자)'], ['LSS', '보다 작으면 (숫자)'], ['LEQ', '이하이면 (숫자)']];

  var BLOCK_DEFS = {
    // ---- 출력 · 기본
    echo:    { cat:'basic', short:'화면 출력', kw:'echo print 글자 메시지', label:['화면에 ', {f:'text'}, ' 출력'], fields:{ text:{type:'text', default:'안녕하세요'} },
               gen:function (f, c) { return echoLine(f.text, c); } },
    log:     { cat:'basic', short:'로그 기록', kw:'log 기록 파일에 쓰기 >> 남기기', tip:'파일 끝에 한 줄씩 덧붙입니다. 파일이 없으면 새로 만듭니다.',
               label:['파일 ', {f:'file'}, ' 에 ', {f:'text'}, ' 한 줄 기록', {f:'time'}],
               fields:{ file:{type:'text', default:'log.txt', req:true}, text:{type:'text', default:'작업 완료'}, time:{type:'select', default:'y', opts:[['y', '(시간 붙여서)'], ['n', '(그대로)']]} },
               gen:function (f, c) { var s = (f.time === 'y' ? '[%DATE% %TIME:~0,8%] ' : '') + txt(f.text, c); return '>> ' + q(f.file) + (s ? ' ECHO ' + s : ' ECHO.'); } },
    comment: { cat:'basic', short:'메모', kw:'rem 주석 설명', label:['메모: ', {f:'text'}], fields:{ text:{type:'text', default:'설명을 입력하세요'} },
               gen:function (f, c) { var s = str(f.text); return 'REM ' + (c.inParen ? s.replace(/\)/g, '^)') : s); } },
    pause:   { cat:'basic', short:'일시정지', kw:'pause 멈춤 키', label:['아무 키나 누를 때까지 멈추기'], gen:function () { return 'PAUSE'; } },
    timeout: { cat:'basic', short:'기다리기', kw:'timeout sleep wait 대기 초', label:[{f:'sec'}, '초 기다리기'], fields:{ sec:{type:'number', default:3, req:true, int:true} },
               gen:function (f) { return 'TIMEOUT /T ' + str(f.sec).trim() + ' > nul'; } },
    cls:     { cat:'basic', short:'화면 지우기', kw:'cls clear', label:['화면 지우기'], gen:function () { return 'CLS'; } },
    title:   { cat:'basic', short:'창 제목', kw:'title 제목', label:['창 제목을 ', {f:'text'}, ' (으)로'], fields:{ text:{type:'text', default:'내 배치파일'} },
               gen:function (f, c) { return 'TITLE ' + txt(f.text, c); } },
    blank:   { cat:'basic', short:'빈 줄', kw:'빈줄 구분', label:['코드에 빈 줄 (보기 좋게 구분)'], gen:function () { return ''; } },
    exitb:   { cat:'basic', short:'끝내기', kw:'exit 종료 끝 중단', tip:'함수 안에서 쓰면 그 함수만 끝내고 돌아갑니다.', label:['여기서 끝내기 (종료 코드 ', {f:'code'}, ')'], fields:{ code:{type:'number', default:0, int:true} },
               gen:function (f) { return 'EXIT /B ' + (str(f.code).trim() || '0'); } },

    // ---- 변수
    setvar:  { cat:'var', short:'변수 정하기', kw:'set 변수 값', setsVar:true, tip:'다른 블록에서 %이름% 으로 씁니다.',
               label:['변수 ', {f:'name'}, ' 을(를) ', {f:'value'}, ' (으)로 정하기'], fields:{ name:{type:'text', default:'MYVAR', req:true, v:true}, value:{type:'text', default:'값'} },
               gen:function (f) { return 'SET "' + name(f.name) + '=' + qtxt(f.value) + '"'; } },
    setcalc: { cat:'var', short:'변수 계산', kw:'set /a 계산 더하기 숫자 카운트', setsVar:true, tip:'계산식에서는 변수 이름을 % 없이 씁니다 (예: COUNT+1). 나머지 연산은 %% 로.',
               label:['변수 ', {f:'name'}, ' 을(를) 계산식 ', {f:'expr'}, ' 결과로'], fields:{ name:{type:'text', default:'NUM', req:true, v:true}, expr:{type:'text', default:'1+1', req:true} },
               gen:function (f) { return 'SET /A "' + name(f.name) + '=' + str(f.expr).replace(/"/g, '') + '"'; } },
    setinput:{ cat:'var', short:'입력받기', kw:'set /p 입력 물어보기 질문', setsVar:true,
               label:[{f:'prompt'}, ' 라고 묻고 대답을 변수 ', {f:'name'}, ' 에 저장'], fields:{ prompt:{type:'text', default:'값을 입력하세요: '}, name:{type:'text', default:'ANSWER', req:true, v:true} },
               gen:function (f) { return 'SET /P "' + name(f.name) + '=' + qtxt(f.prompt) + '"'; } },
    stamp:   { cat:'var', short:'날짜·시간 변수', kw:'date time 날짜 시간 오늘 timestamp 백업 파일명', setsVar:true,
               tip:'형식: yyyy 년, MM 월, dd 일, HH 시, mm 분, ss 초 — 예) yyyy-MM-dd → 2026-10-16. 백업 폴더·파일 이름에 %STAMP% 로 붙여 씁니다.',
               label:['변수 ', {f:'name'}, ' 에 지금 날짜·시간 넣기 (형식 ', {f:'fmt'}, ')'], fields:{ name:{type:'text', default:'STAMP', req:true, v:true}, fmt:{type:'text', default:'yyyyMMdd_HHmmss', req:true} },
               gen:function (f) { return 'FOR /F "delims=" %%T IN (\'POWERSHELL -NoProfile -Command "Get-Date -Format ' + psq(f.fmt) + '"\') DO SET "' + name(f.name) + '=%%T"'; } },
    echovar: { cat:'var', short:'변수 출력', kw:'echo 변수 보기', label:['변수 ', {f:'name'}, ' 값을 화면에 출력'], fields:{ name:{type:'text', default:'MYVAR', req:true, v:true} },
               gen:function (f) { return 'ECHO %' + name(f.name) + '%'; } },

    // ---- 파일 · 폴더
    cd:      { cat:'file', short:'폴더 이동', kw:'cd 이동 작업 폴더', label:['작업 폴더를 ', {f:'path'}, ' 로 이동'], fields:{ path:{type:'text', default:'C:\\work', req:true} },
               gen:function (f) { return 'CD /D ' + q(f.path); } },
    mkdir:   { cat:'file', short:'폴더 만들기', kw:'mkdir md 폴더 생성', label:['폴더 만들기: ', {f:'path'}, ' (이미 있으면 넘어감)'], fields:{ path:{type:'text', default:'backup', req:true} },
               gen:function (f) { return 'IF NOT EXIST ' + q(f.path) + ' MKDIR ' + q(f.path); } },
    copy:    { cat:'file', short:'파일 복사', kw:'copy 복사 파일', label:['파일 복사: ', {f:'src'}, ' → ', {f:'dst'}], fields:{ src:{type:'text', default:'*.txt', req:true}, dst:{type:'text', default:'backup\\', req:true} },
               gen:function (f) { return 'COPY /Y ' + q(f.src) + ' ' + q(f.dst); } },
    xcopy:   { cat:'file', short:'폴더 통째 복사', kw:'xcopy robocopy 백업 backup 폴더 복사 하위', tip:'하위 폴더·숨김 파일까지 복사하고, 같은 이름은 덮어씁니다. 받는 폴더가 없으면 만듭니다.',
               label:['폴더 통째로 복사: ', {f:'src'}, ' → ', {f:'dst'}], fields:{ src:{type:'text', default:'C:\\work\\data', req:true}, dst:{type:'text', default:'D:\\backup\\data', req:true} },
               gen:function (f) { return 'XCOPY ' + q(noSlash(f.src)) + ' ' + q(noSlash(f.dst)) + ' /E /I /H /Y'; } },
    move:    { cat:'file', short:'이동', kw:'move 이동 옮기기', label:['파일/폴더 이동: ', {f:'src'}, ' → ', {f:'dst'}], fields:{ src:{type:'text', default:'*.log', req:true}, dst:{type:'text', default:'archive\\', req:true} },
               gen:function (f) { return 'MOVE /Y ' + q(f.src) + ' ' + q(f.dst); } },
    ren:     { cat:'file', short:'이름 바꾸기', kw:'ren rename 이름 변경', label:['이름 바꾸기: ', {f:'path'}, ' → ', {f:'newname'}], fields:{ path:{type:'text', default:'old.txt', req:true}, newname:{type:'text', default:'new.txt', req:true} },
               gen:function (f) { return 'REN ' + q(f.path) + ' ' + q(f.newname); } },
    zip:     { cat:'file', short:'압축', kw:'zip 압축 compress archive 묶기', tip:'Windows 기본 PowerShell 로 압축합니다. 같은 이름의 zip 은 덮어씁니다.',
               label:[{f:'src'}, ' 을(를) ', {f:'dst'}, ' 로 압축'], fields:{ src:{type:'text', default:'backup', req:true}, dst:{type:'text', default:'backup.zip', req:true} },
               gen:function (f) { return 'POWERSHELL -NoProfile -Command "Compress-Archive -Path ' + psq(f.src) + ' -DestinationPath ' + psq(f.dst) + ' -Force"'; } },
    del:     { cat:'file', short:'파일 삭제', kw:'del 삭제 지우기 erase', label:['파일 삭제: ', {f:'path'}], fields:{ path:{type:'text', default:'*.tmp', req:true} },
               gen:function (f) { return 'DEL /F /Q ' + q(f.path); } },
    delold:  { cat:'file', short:'오래된 파일 삭제', kw:'forfiles 오래된 지난 삭제 정리 로그 days 일', tip:'마지막으로 고친 날짜 기준입니다. 폴더는 지우지 않습니다.',
               label:['폴더 ', {f:'path'}, ' 의 ', {f:'mask'}, ' 중 ', {f:'days'}, '일 지난 파일 삭제', {f:'sub'}],
               fields:{ path:{type:'text', default:'logs', req:true}, mask:{type:'text', default:'*.log', req:true}, days:{type:'number', default:30, req:true, int:true}, sub:{type:'select', default:'n', opts:SUB} },
               gen:function (f) {
                 var m = unq(f.mask);
                 return 'FORFILES /P ' + q(noSlash(f.path)) + (f.sub === 'y' ? ' /S' : '') + ' /M ' + (/\s/.test(m) ? q(m) : m) +
                        ' /D -' + Math.abs(parseInt(f.days, 10) || 0) + ' /C "CMD /C IF @isdir==FALSE DEL /F /Q @path" 2> nul';
               } },
    rmdir:   { cat:'file', short:'폴더 삭제', kw:'rmdir rd 폴더 삭제 지우기', label:['폴더 삭제 (안의 파일까지 모두): ', {f:'path'}], fields:{ path:{type:'text', default:'temp', req:true} },
               gen:function (f) { return 'IF EXIST ' + q(f.path) + ' RMDIR /S /Q ' + q(f.path); } },

    // ---- 조건
    if_exist:     { cat:'flow', container:true, hasElse:true, short:'있으면', kw:'if exist 있으면 존재', label:['만약 파일/폴더 ', {f:'path'}, ' 이(가) 있으면'], fields:{ path:{type:'text', default:'data.txt', req:true} },
                    genOpen:function (f) { return 'IF EXIST ' + q(f.path) + ' ('; } },
    if_not_exist: { cat:'flow', container:true, hasElse:true, short:'없으면', kw:'if not exist 없으면', label:['만약 파일/폴더 ', {f:'path'}, ' 이(가) 없으면'], fields:{ path:{type:'text', default:'data.txt', req:true} },
                    genOpen:function (f) { return 'IF NOT EXIST ' + q(f.path) + ' ('; } },
    if_eq:        { cat:'flow', container:true, hasElse:true, short:'변수 비교', kw:'if 같으면 다르면 비교 변수 크면 작으면 숫자', tip:'같다/다르다는 대소문자를 구분하지 않습니다 (y 와 Y 를 같게 봄).',
                    label:['만약 변수 ', {f:'name'}, ' 이(가) ', {f:'value'}, ' ', {f:'op'}],
                    fields:{ name:{type:'text', default:'ANSWER', req:true, v:true}, value:{type:'text', default:'y'}, op:{type:'select', default:'==', opts:IF_OPS} },
                    genOpen:function (f) {
                      var n = '%' + name(f.name) + '%', v = qtxt(unq(f.value));
                      if (f.op === '==') return 'IF /I "' + n + '"=="' + v + '" (';
                      if (f.op === '!=') return 'IF /I NOT "' + n + '"=="' + v + '" (';
                      return 'IF ' + n + ' ' + f.op + ' ' + (v || '0') + ' (';
                    } },
    if_fail:      { cat:'flow', container:true, hasElse:true, short:'실패하면', kw:'errorlevel 오류 에러 실패 성공 결과', tip:'바로 위 명령의 결과(ERRORLEVEL 1 이상)를 봅니다. "아니면" 칸은 성공했을 때입니다.',
                    label:['만약 바로 앞 명령이 실패하면'], genOpen:function () { return 'IF ERRORLEVEL 1 ('; } },
    if_yes:       { cat:'flow', container:true, hasElse:true, short:'Y/N 확인', kw:'choice 확인 물어보기 y n 예 아니오 질문 계속', tip:'Y 또는 N 키 하나로 답합니다. "아니면" 칸은 N 을 눌렀을 때입니다.',
                    label:['만약 ', {f:'msg'}, ' 라고 물어서 Y를 누르면'], fields:{ msg:{type:'text', default:'계속할까요?'} },
                    genOpen:function (f) { return 'CHOICE /C YN /M "' + qtxt(f.msg) + '"\nIF NOT ERRORLEVEL 2 ('; } },
    if_running:   { cat:'flow', container:true, hasElse:true, short:'실행 중이면', kw:'tasklist 실행 중 프로세스 켜져 있으면 떠 있으면', label:['만약 프로그램 ', {f:'name'}, ' 이(가) 실행 중이면'], fields:{ name:{type:'text', default:'notepad.exe', req:true} },
                    genOpen:function (f) { var n = unq(f.name); return 'TASKLIST /FI "IMAGENAME eq ' + n + '" | FIND /I "' + n + '" > nul\nIF NOT ERRORLEVEL 1 ('; } },

    // ---- 반복
    for_files: { cat:'loop', container:true, short:'파일마다 반복', kw:'for 파일 반복 each 폴더 하위 /r', tip:'안쪽 블록에서 %%F (전체 경로), %%~nxF (파일 이름만), %%~nF (확장자 뺀 이름) 로 씁니다.',
                 label:['폴더 ', {f:'dir'}, ' 의 ', {f:'pattern'}, ' 파일마다 반복', {f:'sub'}, ' — 파일: %%', {f:'v'}],
                 fields:{ dir:{type:'text', default:'.', req:true}, pattern:{type:'text', default:'*.txt', req:true}, sub:{type:'select', default:'n', opts:SUB}, v:{type:'text', default:'F', req:true, loop:true} },
                 genOpen:function (f) {
                   var v = unq(f.v);
                   if (f.sub === 'y') return 'FOR /R ' + q(noSlash(f.dir)) + ' %%' + v + ' IN (' + unq(f.pattern) + ') DO (';
                   return 'FOR %%' + v + ' IN ("' + noSlash(f.dir) + '\\' + unq(f.pattern) + '") DO (';
                 } },
    for_count: { cat:'loop', container:true, short:'숫자만큼 반복', kw:'for /l 횟수 숫자 반복 번', tip:'안쪽 블록에서 %%i 로 지금 숫자를 씁니다.',
                 label:[{f:'from'}, '부터 ', {f:'to'}, '까지 ', {f:'step'}, '씩 반복 — 숫자: %%', {f:'v'}],
                 fields:{ from:{type:'number', default:1, req:true, int:true}, to:{type:'number', default:10, req:true, int:true}, step:{type:'number', default:1, req:true, int:true}, v:{type:'text', default:'i', req:true, loop:true} },
                 genOpen:function (f) { return 'FOR /L %%' + unq(f.v) + ' IN (' + str(f.from).trim() + ',' + str(f.step).trim() + ',' + str(f.to).trim() + ') DO ('; } },
    for_lines: { cat:'loop', container:true, short:'줄마다 반복', kw:'for /f 줄 목록 파일 읽기 lines 한 줄씩', tip:'빈 줄은 건너뜁니다. 안쪽 블록에서 %%L 로 그 줄 내용을 씁니다.',
                 label:['파일 ', {f:'file'}, ' 의 줄마다 반복 — 내용: %%', {f:'v'}], fields:{ file:{type:'text', default:'list.txt', req:true}, v:{type:'text', default:'L', req:true, loop:true} },
                 genOpen:function (f) { return 'FOR /F "usebackq delims=" %%' + unq(f.v) + ' IN (' + q(f.file) + ') DO ('; } },

    // ---- 프로그램 실행
    run:     { cat:'run', short:'프로그램 실행', kw:'start 실행 프로그램 열기 exe', label:['프로그램 실행: ', {f:'path'}, ' 인자 ', {f:'args'}, ' ', {f:'wait'}],
               fields:{ path:{type:'text', default:'notepad.exe', req:true}, args:{type:'text', default:''}, wait:{type:'select', default:'n', opts:[['n', '(띄우고 바로 다음 줄로)'], ['y', '(끝날 때까지 기다림)']]} },
               gen:function (f) { return ('START "" ' + (f.wait === 'y' ? '/WAIT ' : '') + q(f.path) + ' ' + str(f.args)).replace(/\s+$/, ''); } },
    kill:    { cat:'run', short:'프로그램 종료', kw:'taskkill kill 종료 끄기 프로세스 강제', label:['프로그램 강제 종료: ', {f:'name'}], fields:{ name:{type:'text', default:'notepad.exe', req:true} },
               gen:function (f) { return 'TASKKILL /F /IM ' + q(f.name) + ' > nul 2>&1'; } },
    callbat: { cat:'run', short:'배치 호출', kw:'call bat 배치 실행', label:['다른 배치파일 실행하고 돌아오기: ', {f:'path'}], fields:{ path:{type:'text', default:'other.bat', req:true} },
               gen:function (f) { return 'CALL ' + q(f.path); } },
    runcmd:  { cat:'run', short:'코드 직접 입력', kw:'cmd 명령 직접 코드 붙여넣기 raw 기타', tip:'블록에 없는 명령은 여기에 그대로 적습니다. 다른 곳에서 받은 배치 코드를 여러 줄 붙여넣어도 됩니다.',
               setsVar:function (f) { return /(^|[&(]\s*)set\s/im.test(str(f.cmd)); },
               label:['코드 직접 입력', {f:'cmd'}], fields:{ cmd:{type:'textarea', default:'ipconfig /all'} },
               gen:function (f) { return str(f.cmd).replace(/\r\n?/g, '\n').replace(/\s+$/, ''); } },
    // 예전 버전 호환용 (지금은 위쪽 "실행하면" / "다 끝나면" 옵션으로 대신합니다)
    runas:   { cat:'run', hidden:true, short:'관리자 재실행', label:['관리자 권한이 아니면 ', {f:'msg'}, ' 라고 알리고 다시 실행'], fields:{ msg:{type:'text', default:'관리자 권한으로 다시 실행합니다...'} },
               gen:function (f) { return runasCode(f.msg); } },
    selfdel: { cat:'run', hidden:true, short:'내 파일 삭제', label:['이 배치파일 자신을 삭제'], gen:function () { return '(GOTO) 2>nul & DEL "%~f0"'; } },

    // ---- 함수 · 이동
    func:    { cat:'jump', container:true, paren:false, short:'함수 만들기', kw:'함수 function sub 서브루틴 call 묶음', tip:'코드 맨 아래에 따로 만들어집니다. "함수 실행" 블록으로 부르고, 안쪽에서는 넘겨받은 값을 %~1, %~2 로 씁니다.',
               label:['함수 ', {f:'name'}, ' 만들기'], fields:{ name:{type:'text', default:'MYFUNC', req:true, lbl:true} },
               genOpen:function (f) { return ':' + name(f.name); }, genClose:function () { return 'GOTO :EOF'; } },
    callsub: { cat:'jump', short:'함수 실행', kw:'call 함수 실행 부르기 호출', tip:'넘길 값은 칸을 띄워서 여러 개 적을 수 있습니다 (예: "%%F" 백업).',
               label:['함수 ', {f:'name'}, ' 실행 (넘길 값: ', {f:'args'}, ')'], fields:{ name:{type:'text', default:'MYFUNC', req:true, ref:true}, args:{type:'text', default:''} },
               gen:function (f) { return ('CALL :' + name(f.name) + ' ' + str(f.args)).replace(/\s+$/, ''); } },
    label:   { cat:'jump', short:'지점(라벨)', kw:'label 라벨 지점 goto', label:['지점 ', {f:'name'}, ' 표시'], fields:{ name:{type:'text', default:'START', req:true, lbl:true} },
               gen:function (f) { return ':' + name(f.name); } },
    goto:    { cat:'jump', short:'지점으로 이동', kw:'goto 이동 점프 다시', label:['지점 ', {f:'name'}, ' 으로 이동'], fields:{ name:{type:'text', default:'START', req:true, ref:true} },
               gen:function (f) { return 'GOTO ' + name(f.name); } }
  };
  Object.keys(BLOCK_DEFS).forEach(function (k) { BLOCK_DEFS[k].fields = BLOCK_DEFS[k].fields || {}; });

  var CATS = [
    { id:'basic', name:'출력 · 기본' },
    { id:'var',   name:'변수' },
    { id:'file',  name:'파일 · 폴더' },
    { id:'flow',  name:'조건' },
    { id:'loop',  name:'반복' },
    { id:'run',   name:'프로그램 실행' },
    { id:'jump',  name:'함수 · 이동' }
  ];

  // ================= 블록 트리 =================
  var uid = 1;
  function newId() { return 'b' + (uid++) + '_' + Math.random().toString(36).slice(2, 7); }

  function createBlock(type) {
    var def = BLOCK_DEFS[type], fields = {};
    Object.keys(def.fields).forEach(function (k) { fields[k] = def.fields[k].default; });
    var b = { id: newId(), type: type, fields: fields };
    if (def.container) { b.children = []; if (def.hasElse) { b.elseChildren = []; b.showElse = false; } }
    return b;
  }
  function duplicateBlock(b) {
    var c = { id: newId(), type: b.type, fields: JSON.parse(JSON.stringify(b.fields)) };
    if (b.children) c.children = b.children.map(duplicateBlock);
    if (b.elseChildren) { c.elseChildren = b.elseChildren.map(duplicateBlock); c.showElse = b.showElse; }
    return c;
  }
  function sanitize(data) {
    var seen = {};
    function fix(list) {
      if (!Array.isArray(list)) return [];
      var out = [];
      list.forEach(function (b) {
        if (!b || !BLOCK_DEFS[b.type]) return;
        var def = BLOCK_DEFS[b.type], fields = {};
        Object.keys(def.fields).forEach(function (k) {
          var fd = def.fields[k], v = b.fields && b.fields[k] != null ? b.fields[k] : fd.default;
          if (fd.type === 'select' && !fd.opts.some(function (o) { return o[0] === v; })) v = fd.default;
          fields[k] = v;
        });
        var id = b.id && !seen[b.id] ? String(b.id) : newId();
        seen[id] = true;
        var nb = { id: id, type: b.type, fields: fields };
        if (def.container) {
          nb.children = fix(b.children);
          if (def.hasElse) { nb.elseChildren = fix(b.elseChildren); nb.showElse = !!b.showElse; }
        }
        out.push(nb);
      });
      return out;
    }
    return { blocks: fix(data && data.blocks) };
  }
  // 화면에 보이는 블록만 돌기 (숨긴 "아니면" 칸 제외)
  function walk(list, fn, ctx) {
    ctx = ctx || { inParen: false, inLoop: false, depth: 0 };
    list.forEach(function (b) {
      fn(b, ctx);
      var def = BLOCK_DEFS[b.type];
      if (!def.container) return;
      var sub = { inParen: ctx.inParen || def.paren !== false, inLoop: ctx.inLoop || def.cat === 'loop', depth: ctx.depth + 1 };
      walk(b.children, fn, sub);
      if (def.hasElse && b.showElse) walk(b.elseChildren, fn, sub);
    });
  }
  function findBlock(id) {
    var res = null;
    (function scan(list, parentId, branch) {
      for (var i = 0; i < list.length && !res; i++) {
        var b = list[i];
        if (b.id === id) { res = { block: b, list: list, index: i, parentId: parentId, branch: branch }; return; }
        if (b.children) scan(b.children, b.id, 'children');
        if (b.elseChildren && !res) scan(b.elseChildren, b.id, 'elseChildren');
      }
    })(ws.blocks, null, 'children');
    return res;
  }
  function collectIds(b, ids) {
    ids[b.id] = true;
    (b.children || []).forEach(function (c) { collectIds(c, ids); });
    (b.elseChildren || []).forEach(function (c) { collectIds(c, ids); });
    return ids;
  }
  function listOf(parentId, branch) {
    if (parentId === null) return ws.blocks;
    var f = findBlock(parentId);
    if (!f || !f.block[branch]) return null;
    if (branch === 'elseChildren' && !f.block.showElse) return null;
    return f.block[branch];
  }

  // ================= 코드 생성 =================
  function getEncoding() { return $('optEncoding').value === 'utf8' ? 'utf8' : 'cp949'; }
  function opts() {
    return { echoOff: $('optEchoOff').checked, cdSelf: $('optCdSelf').checked, admin: $('optAdmin').checked,
             pauseEnd: $('optPauseEnd').checked, selfDel: $('optSelfDel').checked, utf8: getEncoding() === 'utf8' };
  }
  function setsVar(b) { var s = BLOCK_DEFS[b.type].setsVar; return typeof s === 'function' ? s(b.fields) : !!s; }
  function needsDelayed() {
    var need = false;
    walk(ws.blocks, function (b, ctx) { if (ctx.inParen && setsVar(b)) need = true; });
    return need;
  }
  function toDelayed(l) {
    return l.replace(/%%/g, '\u0000').replace(VAR_RE, '!$1!').replace(/\u0000/g, '%%');
  }
  function pad(n) { return new Array(n + 1).join('  '); }
  function pushCode(out, code, indent, inParen, id) {
    str(code).split('\n').forEach(function (l) {
      if (G.delayed && inParen) l = toDelayed(l);
      out.push({ t: l.trim() === '' ? '' : pad(indent) + l, id: id });
    });
  }
  function genLines(list, indent, inParen, out) { list.forEach(function (b) { genBlock(b, indent, inParen, out); }); }
  function genBranch(list, indent, inParen, out, id) {
    var start = out.length;
    genLines(list, indent, inParen, out);
    // 빈 괄호 ( ) 는 문법 오류라서 자리만 채웁니다
    if (!out.slice(start).some(function (l) { return l.t !== ''; })) out.push({ t: pad(indent) + 'REM 비어 있음', id: id });
  }
  function genBlock(b, indent, inParen, out) {
    var def = BLOCK_DEFS[b.type], c = { inParen: inParen };
    if (!def.container) {
      var s = def.gen(b.fields, c);
      if (s === '') out.push({ t: '', id: b.id }); else pushCode(out, s, indent, inParen, b.id);
      return;
    }
    var inner = inParen || def.paren !== false;
    pushCode(out, def.genOpen(b.fields, c), indent, inParen, b.id);
    if (def.paren === false) genLines(b.children, indent + 1, inner, out);
    else genBranch(b.children, indent + 1, inner, out, b.id);
    if (def.hasElse && b.showElse) {
      pushCode(out, ') ELSE (', indent, inParen, b.id);
      genBranch(b.elseChildren, indent + 1, inner, out, b.id);
    }
    pushCode(out, def.genClose ? def.genClose(b.fields, c) : ')', indent, inParen, b.id);
  }
  // 반환: [{ t: 코드 한 줄, id: 그 줄을 만든 블록 id | 'hat' | 'end' | null }]
  function generate() {
    var o = opts(), out = [];
    var main = ws.blocks.filter(function (b) { return b.type !== 'func'; });
    var funcs = ws.blocks.filter(function (b) { return b.type === 'func'; });
    function add(t, id) { out.push({ t: t, id: id }); }
    G.delayed = needsDelayed();
    if (o.echoOff) add('@ECHO OFF', 'hat');
    if (o.utf8) add('CHCP 65001 > nul', 'hat');
    if (o.admin) runasCode('관리자 권한으로 다시 실행합니다...').split('\n').forEach(function (l) { add(l, 'hat'); });
    if (o.cdSelf) add('CD /D "%~dp0"', 'hat');
    if (G.delayed) add('SETLOCAL ENABLEDELAYEDEXPANSION', 'hat');
    add('', null);
    genLines(main, 0, false, out);
    add('', null);
    if (o.pauseEnd) add('PAUSE', 'end');
    if (o.selfDel) add('(GOTO) 2>nul & DEL "%~f0"', 'end');
    else if (funcs.length) add('EXIT /B', 'end');
    funcs.forEach(function (b) { add('', null); genBlock(b, 0, false, out); });
    var res = [];
    out.forEach(function (l) { if (l.t === '' && (!res.length || res[res.length - 1].t === '')) return; res.push(l); });
    while (res.length && res[res.length - 1].t === '') res.pop();
    return res;
  }

  var HL_KW = 'ECHO|SET|IF|ELSE|EXIST|NOT|FOR|IN|DO|GOTO|CALL|EXIT|CLS|PAUSE|TITLE|START|COPY|XCOPY|MOVE|DEL|REN|MKDIR|RMDIR|TIMEOUT|CHCP|CD|EQU|NEQ|LSS|LEQ|GTR|GEQ|NET|SESSION|ERRORLEVEL|POWERSHELL|CHOICE|FORFILES|TASKLIST|TASKKILL|FIND|SETLOCAL|ENABLEDELAYEDEXPANSION';
  var HL_RE = new RegExp('(^[ \\t]*(?:REM\\b|::).*$)|("[^"]*")|(%%~?[a-z]*[A-Za-z]|%~[a-z]*[0-9]|%[0-9*]|![^!\\s]+!|%[^%\\s"]+%)|\\b(' + HL_KW + ')\\b', 'gi');
  function hlLine(code) {
    var out = '', last = 0, m;
    HL_RE.lastIndex = 0;
    while ((m = HL_RE.exec(code))) {
      if (!m[0]) { HL_RE.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      out += '<span class="' + (m[1] ? 'cm' : m[2] ? 'str' : m[3] ? 'fn' : 'kw') + '">' + esc(m[0]) + '</span>';
      last = HL_RE.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  // ================= 검증 =================
  function norm(n) { return name(n).toUpperCase(); }
  function validate() {
    var issues = [], bad = {}, labels = {}, refs = [];
    function add(b, msg, warn, field) { issues.push({ id: b.id, msg: BLOCK_DEFS[b.type].short + ' — ' + msg, warn: !!warn }); if (field) bad[b.id + ':' + field] = true; }
    walk(ws.blocks, function (b, ctx) {
      var def = BLOCK_DEFS[b.type];
      Object.keys(def.fields).forEach(function (k) {
        var fd = def.fields[k], v = str(b.fields[k]).trim();
        if (fd.req && v === '') add(b, '빈 칸을 채우세요', false, k);
        else if (fd.loop && !/^[A-Za-z]$/.test(v)) add(b, '반복 변수는 영문 한 글자만 됩니다 (예: F)', false, k);
        else if ((fd.v || fd.lbl || fd.ref) && /[\s%!="^&|<>()]/.test(name(v))) add(b, '이름에 띄어쓰기나 특수문자는 쓸 수 없습니다', false, k);
        else if (fd.int && v !== '' && !/^-?\d+$/.test(v)) add(b, '숫자만 넣으세요', false, k);
        if (fd.lbl && v) {
          if (labels[norm(v)]) add(b, '같은 이름(' + name(v) + ')이 이미 있습니다', false, k);
          labels[norm(v)] = true;
        }
        if (fd.ref && v) refs.push({ b: b, k: k });
      });
      if (b.type === 'func' && ctx.depth > 0) add(b, '함수 만들기는 다른 블록 안이 아니라 맨 바깥에 두세요');
      if (b.type === 'label' && ctx.inParen) add(b, '지점(라벨)은 조건·반복 안에서는 동작하지 않습니다. 밖으로 빼거나 함수를 쓰세요');
      if (b.type === 'goto' && ctx.inLoop) add(b, '반복 안에서 지점으로 이동하면 반복이 거기서 끝나 버립니다. 함수 실행을 쓰세요', true);
      if (b.type === 'rmdir' && /^([A-Za-z]:\\?|\\|\.{1,2}\\?)$/.test(unq(b.fields.path))) add(b, '드라이브 전체나 지금 폴더를 통째로 지우게 됩니다', false, 'path');
      if (b.type === 'del' && /^([A-Za-z]:)?\\?\*(\.\*)?$/.test(unq(b.fields.path))) add(b, '폴더 안의 모든 파일(이 배치파일 포함)을 지웁니다. 맞는지 확인하세요', true, 'path');
      if (b.type === 'if_eq' && b.fields.op !== '==' && b.fields.op !== '!=' && !/^-?\d+$/.test(unq(b.fields.value)) && !/[%!]/.test(b.fields.value)) add(b, '숫자 비교에는 숫자를 넣으세요', false, 'value');
      if (def.container && def.paren !== false) {
        var any = false;
        walk(b.children, function () { any = true; });
        if (!any) add(b, '안이 비어 있습니다', true);
      }
    });
    refs.forEach(function (r) {
      var n = norm(r.b.fields[r.k]);
      if (n === 'EOF' || labels[n]) return;
      add(r.b, (r.b.type === 'goto' ? '지점 ' : '함수 ') + name(r.b.fields[r.k]) + ' 이(가) 없습니다', false, r.k);
    });
    issues.sort(function (a, b) { return a.warn - b.warn; });
    return { issues: issues, bad: bad };
  }

  // ================= 인코딩 =================
  // cmd.exe 는 BOM 을 이해하지 못하고(첫 줄 명령어가 깨짐), CHCP 가 없으면 파일을 시스템 코드페이지(한국어 윈도우: 949)로 읽습니다.
  // 그래서 기본값은 CP949 바이트로 직접 저장하고, UTF-8 모드는 BOM 없이 CHCP 65001 을 붙여 저장합니다.
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
        if (s.length === 1 && s !== '\uFFFD' && !map.has(s)) map.set(s, (lead << 8) | trail);
      }
    }
    cp949Table = map;
    return map;
  }
  // 반환: { bytes: Uint8Array, bad: [CP949로 표현 못 하는 글자들] } / 브라우저 미지원 시 null
  function encodeCp949(s) {
    var out = [], bad = [], table = null;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) { out.push(c); continue; }
      if (!table) { table = getCp949Table(); if (!table) return null; }
      var ch = s.charAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { ch = s.substr(i, 2); i++; }
      var code = table.get(ch);
      if (code === undefined) { out.push(0x3F); if (bad.indexOf(ch) < 0) bad.push(ch); }
      else out.push(code >> 8, code & 0xFF);
    }
    return { bytes: new Uint8Array(out), bad: bad };
  }

  // ================= 상태 =================
  var ws = sanitize(Portal.store.get('workspace', { blocks: [] }));
  var cursor = { parent: null, branch: 'children', index: ws.blocks.length };
  var selectedId = null, dragPayload = null;
  var undoStack = [], redoStack = [], pendingSnap = null;
  var genTimer = null, saveTimer = null, lastIssues = [];
  var form = null;

  function snap() { return JSON.stringify({ ws: ws, cursor: cursor }); }
  function pushUndo(s) { undoStack.push(s || snap()); if (undoStack.length > 100) undoStack.shift(); redoStack = []; updUndoBtns(); }
  function restore(s) { var o = JSON.parse(s); ws = sanitize(o.ws); cursor = o.cursor || rootEnd(); selectedId = null; saveAndRender(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); }
  function updUndoBtns() { $('btnUndo').disabled = !undoStack.length; $('btnRedo').disabled = !redoStack.length; }

  function rootEnd() { return { parent: null, branch: 'children', index: ws.blocks.length }; }
  function fixCursor() {
    var l = listOf(cursor.parent, cursor.branch);
    if (!l) cursor = rootEnd();
    else cursor.index = Math.max(0, Math.min(cursor.index, l.length));
  }
  function change(fn) { pushUndo(); fn(); saveAndRender(); }
  function scheduleGen() { clearTimeout(genTimer); genTimer = setTimeout(refreshCode, 120); }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { Portal.store.set('workspace', ws); }, 400); }
  function saveAndRender() { fixCursor(); Portal.store.set('workspace', ws); render(); refreshCode(); }

  function refreshCode() {
    var lines = generate();
    var raw = lines.map(function (l) { return l.t; }).join('\n') + '\n';
    $('out').innerHTML = '<span class="bb-lines">' + lines.map(function (l) {
      return '<span class="bb-ln"' + (l.id ? ' data-id="' + l.id + '"' : '') + '>' + (l.t ? hlLine(l.t) : ' ') + '</span>';
    }).join('') + '</span>';
    $('out').dataset.raw = raw;
    $('bbNote').hidden = !G.delayed;
    $('adminWarn').hidden = !$('optAdmin').checked;
    markCode(false);
    updateEncodingWarning(raw);
    runValidation();
    updateLists();
  }
  function markCode(scroll) {
    var ids = {};
    if (selectedId) { var f = findBlock(selectedId); if (f) collectIds(f.block, ids); }
    var first = null;
    $('out').querySelectorAll('.bb-ln').forEach(function (el) {
      var on = !!ids[el.getAttribute('data-id')];
      el.classList.toggle('on', on);
      if (on && !first) first = el;
    });
    if (first && scroll) {
      var pre = $('out'), top = first.offsetTop;
      if (top < pre.scrollTop + 10 || top > pre.scrollTop + pre.clientHeight - 40) pre.scrollTop = Math.max(0, top - 60);
    }
  }
  function updateEncodingWarning(code) {
    var box = $('encWarn'), bad = [];
    if (getEncoding() === 'cp949') { var r = encodeCp949(code); if (r) bad = r.bad; }
    box.hidden = !bad.length;
    if (bad.length) box.textContent = '⚠ ANSI(CP949)로 저장할 수 없는 글자가 있어 ?로 바뀝니다: ' + bad.slice(0, 10).join(' ') +
      (bad.length > 10 ? ' …' : '') + '  →  꼭 필요하면 "한글 저장 방식"을 UTF-8로 바꾸세요.';
  }
  function runValidation() {
    var r = validate();
    lastIssues = r.issues;
    document.querySelectorAll('#wsList [data-fk]').forEach(function (el) { el.classList.toggle('bad', !!r.bad[el.getAttribute('data-fk')]); });
    var box = $('msg');
    if (!r.issues.length) { box.className = 'msg'; box.innerHTML = ''; return; }
    box.className = 'msg err';
    box.innerHTML = '<ul class="bb-issues">' + r.issues.map(function (it, i) {
      return '<li data-i="' + i + '"' + (it.warn ? ' class="warn"' : '') + '><b>' + (it.warn ? '확인' : '고칠 곳') + '</b> ' + esc(it.msg) + '</li>';
    }).join('') + '</ul>';
  }
  function updateLists() {
    var vars = {}, labels = {};
    walk(ws.blocks, function (b) {
      var def = BLOCK_DEFS[b.type];
      Object.keys(def.fields).forEach(function (k) {
        var v = name(b.fields[k]);
        if (!v) return;
        if (def.fields[k].v && def.setsVar === true) vars[v] = true;
        if (def.fields[k].lbl) labels[v] = true;
      });
    });
    ['ERRORLEVEL', 'DATE', 'TIME', 'USERNAME', 'COMPUTERNAME', 'USERPROFILE'].forEach(function (v) { vars[v] = true; });
    var opt = function (o) { return Object.keys(o).map(function (v) { return '<option value="' + esc(v) + '">'; }).join(''); };
    $('bbVarList').innerHTML = opt(vars);
    $('bbLabelList').innerHTML = opt(labels);
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
      e.appendChild(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return e;
  }
  function isFormEl(t) { return !!(t && t.closest && t.closest('input,textarea,select,button,option,label')); }
  function grow(el, fd) {
    if (fd.type === 'number') { el.style.width = '64px'; return; }
    if (fd.type === 'select') return;
    if (fd.type === 'textarea') { el.rows = Math.min(14, Math.max(2, str(el.value).split('\n').length)); return; }
    el.style.width = Math.round(Math.max(44, Math.min(340, textWidth(str(el.value)) + 26))) + 'px';
  }
  var measureCtx = null;
  function textWidth(s) {
    if (!measureCtx) {
      measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '12px ' + getComputedStyle(document.body).fontFamily;
    }
    return measureCtx.measureText(s).width;
  }
  function clearDropHints() {
    document.querySelectorAll('.drop-before,.drop-after,.drop-into,.drop-active').forEach(function (el) {
      el.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-active');
    });
  }
  function optLabel(fd, v) { var o = fd.opts.filter(function (x) { return x[0] === v; })[0]; return o ? o[1] : v; }

  // ================= 블록 넣기 · 옮기기 · 지우기 =================
  function afterInsert(nb, parentId, branch, index) {
    selectedId = nb.id;
    cursor = BLOCK_DEFS[nb.type].container ? { parent: nb.id, branch: 'children', index: 0 } : { parent: parentId, branch: branch, index: index + 1 };
  }
  function insertAtCursor(type) {
    fixCursor();
    var p = cursor.parent, br = cursor.branch, ix = cursor.index, list = listOf(p, br);
    pushUndo();
    var nb = createBlock(type);
    list.splice(ix, 0, nb);
    afterInsert(nb, p, br, ix);
    saveAndRender();
    scrollToBlock(nb.id);
  }
  function handleDrop(parentId, branch, index) {
    var p = dragPayload; dragPayload = null;
    if (!p) return;
    var target = listOf(parentId, branch);
    if (!target) return;
    if (p.kind === 'palette') {
      pushUndo();
      var nb = createBlock(p.type);
      target.splice(index, 0, nb);
      afterInsert(nb, parentId, branch, index);
    } else {
      var f = findBlock(p.id);
      if (!f) return;
      if (parentId !== null && collectIds(f.block, {})[parentId]) return;   // 자기 안으로는 못 넣음
      pushUndo();
      f.list.splice(f.index, 1);
      if (f.list === target && f.index < index) index--;
      target.splice(index, 0, f.block);
      selectedId = f.block.id;
      cursor = { parent: parentId, branch: branch, index: index + 1 };
    }
    saveAndRender();
  }
  function removeBlock(id) {
    var f = findBlock(id);
    if (!f) return;
    pushUndo();
    f.list.splice(f.index, 1);
    if (selectedId === id) selectedId = null;
    if (!listOf(cursor.parent, cursor.branch)) cursor = { parent: f.parentId, branch: f.branch, index: f.index };
    else if (cursor.parent === f.parentId && cursor.branch === f.branch && cursor.index > f.index) cursor.index--;
    saveAndRender();
  }
  function duplicate(id) {
    var f = findBlock(id);
    if (!f) return;
    change(function () {
      var d = duplicateBlock(f.block);
      f.list.splice(f.index + 1, 0, d);
      selectedId = d.id;
      cursor = { parent: f.parentId, branch: f.branch, index: f.index + 2 };
    });
  }
  function select(id, scrollBlock) {
    selectedId = id;
    document.querySelectorAll('#wsList .blk.sel').forEach(function (x) { x.classList.remove('sel'); });
    if (id) {
      var el = document.querySelector('#wsList .blk[data-id="' + id + '"]');
      if (el) { el.classList.add('sel'); if (scrollBlock) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
    markCode(true);
  }
  function scrollToBlock(id) {
    var el = document.querySelector('#wsList .blk[data-id="' + id + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function setCursor(parentId, branch, index) { selectedId = null; cursor = { parent: parentId, branch: branch, index: index }; render(); }

  // 끌어다 놓을 수 있는 칸
  function dropZone(el, parentId, branch, idxFn, cls) {
    cls = cls || 'drop-active';
    el.addEventListener('dragover', function (e) { if (!dragPayload) return; e.preventDefault(); e.stopPropagation(); if (!el.classList.contains(cls)) { clearDropHints(); el.classList.add(cls); } });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove(cls); });
    el.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); clearDropHints(); handleDrop(parentId, branch, idxFn()); });
  }

  // ================= 렌더링 =================
  function renderField(b, k, fd) {
    var el;
    if (fd.type === 'select') {
      el = h('select', { class: 'blk-field' });
      fd.opts.forEach(function (o) { el.appendChild(h('option', { value: o[0] }, o[1])); });
    } else if (fd.type === 'textarea') {
      el = h('textarea', { class: 'blk-field blk-ta', spellcheck: 'false', placeholder: '명령어를 한 줄에 하나씩' });
    } else {
      el = h('input', { type: fd.type === 'number' ? 'number' : 'text', class: 'blk-field', spellcheck: 'false', autocomplete: 'off' });
      if (fd.v) el.setAttribute('list', 'bbVarList');
      if (fd.ref) el.setAttribute('list', 'bbLabelList');
    }
    el.value = b.fields[k];
    el.setAttribute('data-fk', b.id + ':' + k);
    el.addEventListener('focus', function () { pendingSnap = snap(); if (selectedId !== b.id) select(b.id, false); });
    el.addEventListener(fd.type === 'select' ? 'change' : 'input', function () {
      if (pendingSnap) { pushUndo(pendingSnap); pendingSnap = null; }
      b.fields[k] = el.value;
      grow(el, fd);
      scheduleGen(); scheduleSave();
    });
    grow(el, fd);
    return el;
  }

  function renderActions(b, list, idx, def) {
    var a = h('div', { class: 'blk-actions' });
    function btn(t, title, fn, cls) {
      a.appendChild(h('button', { type: 'button', class: 'blk-btn' + (cls ? ' ' + cls : ''), title: title, onclick: function (e) { e.stopPropagation(); fn(); } }, t));
    }
    btn('▲', '위로', function () { if (idx > 0) change(function () { list.splice(idx - 1, 0, list.splice(idx, 1)[0]); selectedId = b.id; }); });
    btn('▼', '아래로', function () { if (idx < list.length - 1) change(function () { list.splice(idx + 1, 0, list.splice(idx, 1)[0]); selectedId = b.id; }); });
    btn('⧉', '복제 (Ctrl+D)', function () { duplicate(b.id); });
    if (def.hasElse) btn(b.showElse ? '아니면 빼기' : '+아니면', '"아니면"(ELSE) 칸 넣기/빼기', function () { change(function () { b.showElse = !b.showElse; selectedId = b.id; }); });
    btn('✕', '삭제 (Delete)', function () { removeBlock(b.id); }, 'danger');
    return a;
  }

  function renderMouth(b, branch, tag) {
    var m = h('div', { class: 'blk-mouth' });
    if (tag) {
      var t = h('div', { class: 'blk-branch', title: '클릭하면 이 안쪽 맨 앞에 커서를 둡니다' }, tag);
      t.addEventListener('click', function (e) { e.stopPropagation(); setCursor(b.id, branch, 0); });
      dropZone(t, b.id, branch, function () { return 0; });
      m.appendChild(t);
    }
    m.appendChild(renderList(b[branch], b.id, branch));
    return m;
  }

  function renderBlock(b, list, idx, parentId, branch) {
    var def = BLOCK_DEFS[b.type];
    var el = h('div', { class: 'blk cat-' + def.cat + (def.container ? ' blk-c' : '') + (b.id === selectedId ? ' sel' : ''), 'data-id': b.id });
    var head = h('div', { class: 'blk-head', title: def.tip || '' });
    head.appendChild(h('span', { class: 'blk-handle', title: '끌어서 옮기기' }, '⠿'));
    var label = h('span', { class: 'blk-label' });
    def.label.forEach(function (seg) {
      label.appendChild(typeof seg === 'string' ? h('span', null, seg) : renderField(b, seg.f, def.fields[seg.f]));
    });
    head.appendChild(label);
    head.appendChild(renderActions(b, list, idx, def));
    el.appendChild(head);

    // 클릭하면 선택 + 커서를 이 블록 바로 아래로
    head.addEventListener('click', function (e) {
      if (isFormEl(e.target)) return;
      selectedId = b.id; cursor = { parent: parentId, branch: branch, index: idx + 1 };
      render();
    });
    // 끌기: 입력칸 위에서 누르면 글자 선택이 되도록 끌기를 끕니다
    head.addEventListener('mousedown', function (e) {
      document.querySelectorAll('.blk[draggable="true"]').forEach(function (x) { x.setAttribute('draggable', 'false'); });
      el.setAttribute('draggable', isFormEl(e.target) ? 'false' : 'true');
    });
    el.addEventListener('dragstart', function (e) {
      if (e.target !== el) return;
      e.stopPropagation();
      dragPayload = { kind: 'move', id: b.id };
      e.dataTransfer.setData('text/plain', b.id);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(function () { el.classList.add('dragging'); }, 0);
    });
    el.addEventListener('dragend', function (e) {
      if (e.target !== el) return;
      el.classList.remove('dragging'); el.setAttribute('draggable', 'false'); clearDropHints(); dragPayload = null;
    });
    // 놓기: 윗부분 = 앞, 아랫부분 = 뒤 (조건·반복 블록이면 안쪽 맨 앞)
    function where(e) { var r = head.getBoundingClientRect(); return (e.clientY - r.top) < r.height / 2 ? 'before' : def.container ? 'into' : 'after'; }
    head.addEventListener('dragover', function (e) {
      if (!dragPayload) return;
      e.preventDefault(); e.stopPropagation();
      var w = where(e);
      clearDropHints();
      if (w === 'into') el.querySelector('.blk-mouth').classList.add('drop-into');
      else el.classList.add('drop-' + w);
    });
    head.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      var w = where(e);
      clearDropHints();
      if (w === 'before') handleDrop(parentId, branch, idx);
      else if (w === 'after') handleDrop(parentId, branch, idx + 1);
      else handleDrop(b.id, 'children', 0);
    });

    if (def.container) {
      var tag = def.hasElse ? '그러면' : def.cat === 'loop' ? '반복할 내용' : '함수 내용';
      el.appendChild(renderMouth(b, 'children', tag));
      if (def.hasElse && b.showElse) {
        var mid = h('div', { class: 'blk-mid', title: '클릭하면 "아니면" 칸 맨 앞에 커서를 둡니다' }, '아니면');
        mid.addEventListener('click', function (e) { e.stopPropagation(); setCursor(b.id, 'elseChildren', 0); });
        dropZone(mid, b.id, 'elseChildren', function () { return 0; });
        el.appendChild(mid);
        el.appendChild(renderMouth(b, 'elseChildren', null));
      }
      var foot = h('div', { class: 'blk-foot', title: '클릭하면 이 블록 다음에 커서를 둡니다' });
      foot.addEventListener('click', function (e) { e.stopPropagation(); selectedId = b.id; cursor = { parent: parentId, branch: branch, index: idx + 1 }; render(); });
      foot.addEventListener('dragover', function (e) { if (!dragPayload) return; e.preventDefault(); e.stopPropagation(); clearDropHints(); el.classList.add('drop-after'); });
      foot.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); clearDropHints(); handleDrop(parentId, branch, idx + 1); });
      el.appendChild(foot);
    }
    return el;
  }

  function cursorEl(parentId, branch, index) {
    var first = parentId === null && !ws.blocks.length;
    var el = h('div', { class: 'bb-cursor' + (first ? ' first' : '') },
      first ? '왼쪽 블록을 클릭하거나 끌어다 놓으면 여기부터 쌓입니다' : '다음 블록이 여기에 들어갑니다');
    dropZone(el, parentId, branch, function () { return index; });
    return el;
  }
  function slotEl(parentId, branch) {
    var el = h('div', { class: 'blk-slot' }, '비어 있음 — 클릭하면 커서를 여기로');
    el.addEventListener('click', function (e) { e.stopPropagation(); setCursor(parentId, branch, 0); });
    dropZone(el, parentId, branch, function () { return 0; });
    return el;
  }
  function renderList(list, parentId, branch) {
    var wrap = h('div', { class: 'blk-list' });
    var here = cursor.parent === parentId && cursor.branch === branch;
    list.forEach(function (b, i) {
      if (here && cursor.index === i) wrap.appendChild(cursorEl(parentId, branch, i));
      wrap.appendChild(renderBlock(b, list, i, parentId, branch));
    });
    if (here && cursor.index >= list.length) wrap.appendChild(cursorEl(parentId, branch, list.length));
    else if (!list.length) wrap.appendChild(slotEl(parentId, branch));
    return wrap;
  }
  function render() {
    fixCursor();
    var root = $('wsList');
    root.innerHTML = '';
    root.appendChild(renderList(ws.blocks, null, 'children'));
    markCode(false);
    updUndoBtns();
  }

  // ================= 팔레트 =================
  var searchCache = {};
  function sampleCode(type) {
    var out = [], d = G.delayed;
    G.delayed = false;
    genBlock(createBlock(type), 0, false, out);
    G.delayed = d;
    return out.map(function (l) { return l.t; }).join('\n');
  }
  function searchText(type) {
    if (searchCache[type]) return searchCache[type];
    var def = BLOCK_DEFS[type];
    var s = [def.short, def.kw || '', sampleCode(type)].concat(def.label.map(function (seg) {
      return typeof seg === 'string' ? seg : str(def.fields[seg.f].default);
    })).join(' ').toLowerCase();
    return (searchCache[type] = s);
  }
  function chipEl(type) {
    var def = BLOCK_DEFS[type];
    var chip = h('div', { class: 'pal-chip cat-' + def.cat + (def.container ? ' pal-c' : ''), draggable: 'true',
      title: '코드: ' + sampleCode(type).replace(/\n\s*REM 비어 있음/, '') + (def.tip ? '\n\n' + def.tip : '') });
    def.label.forEach(function (seg) {
      if (typeof seg === 'string') { chip.appendChild(document.createTextNode(seg)); return; }
      var fd = def.fields[seg.f], v = fd.type === 'select' ? optLabel(fd, fd.default) : fd.type === 'textarea' ? '…' : str(fd.default);
      chip.appendChild(h('span', { class: 'pal-slot' }, v === '' ? '\u00a0' : v));
    });
    if (def.container) chip.appendChild(h('span', { class: 'pal-mouth' }));
    chip.addEventListener('dragstart', function (e) { dragPayload = { kind: 'palette', type: type }; e.dataTransfer.setData('text/plain', type); e.dataTransfer.effectAllowed = 'copy'; });
    chip.addEventListener('dragend', function () { dragPayload = null; clearDropHints(); });
    chip.addEventListener('click', function () { insertAtCursor(type); });
    return chip;
  }
  function renderPalette(filter) {
    var root = $('palette'), fq = str(filter).trim().toLowerCase();
    root.innerHTML = '';
    CATS.forEach(function (cat) {
      var types = Object.keys(BLOCK_DEFS).filter(function (k) {
        var d = BLOCK_DEFS[k];
        return d.cat === cat.id && !d.hidden && (!fq || fq.split(/\s+/).every(function (w) { return searchText(k).indexOf(w) >= 0; }));
      });
      if (!types.length) return;
      var sec = h('div', { class: 'pal-cat cat-' + cat.id });
      sec.appendChild(h('div', { class: 'pal-cat-title' }, h('span', { class: 'pal-dot' }), cat.name));
      types.forEach(function (t) { sec.appendChild(chipEl(t)); });
      root.appendChild(sec);
    });
    if (!root.children.length) root.appendChild(h('div', { class: 'pal-none' }, '맞는 블록이 없습니다. "코드 직접 입력" 블록에 명령어를 그대로 적을 수 있어요.'));
  }

  // ================= 예제 =================
  function mk(type, fields, kids, elseKids) {
    var b = createBlock(type);
    Object.keys(fields || {}).forEach(function (k) { b.fields[k] = fields[k]; });
    if (kids) b.children = kids;
    if (elseKids) { b.elseChildren = elseKids; b.showElse = true; }
    return b;
  }
  var PRESETS = [
    { name: '로그 파일을 backup 폴더로 정리', build: function () { return [
      mk('comment', { text: '이 폴더의 log 파일을 backup 폴더로 옮깁니다.' }),
      mk('mkdir', { path: 'backup' }),
      mk('for_files', { dir: '.', pattern: '*.log', v: 'F' }, [mk('move', { src: '%%F', dst: 'backup\\' })]),
      mk('echo', { text: '정리가 끝났습니다.' })]; } },
    { name: '날짜별 폴더 백업 + 결과 기록', build: function () { return [
      mk('comment', { text: '작업 폴더를 날짜가 붙은 백업 폴더로 통째로 복사합니다.' }),
      mk('stamp', { name: 'STAMP', fmt: 'yyyyMMdd_HHmm' }),
      mk('xcopy', { src: 'C:\\work\\data', dst: 'D:\\backup\\data_%STAMP%' }),
      mk('if_fail', {}, [mk('echo', { text: '백업에 실패했습니다.' }), mk('log', { file: 'backup.log', text: '실패: data_%STAMP%' })],
                        [mk('echo', { text: '백업 완료: D:\\backup\\data_%STAMP%' }), mk('log', { file: 'backup.log', text: '완료: data_%STAMP%' })])]; } },
    { name: '30일 지난 로그 지우기 (확인 후)', build: function () { return [
      mk('if_yes', { msg: '30일 지난 로그 파일을 지울까요?' },
        [mk('delold', { path: 'logs', mask: '*.log', days: 30, sub: 'n' }), mk('echo', { text: '정리했습니다.' })],
        [mk('echo', { text: '취소했습니다.' })])]; } },
    { name: '프로그램 껐다가 다시 켜기', build: function () { return [
      mk('if_running', { name: 'app.exe' }, [mk('echo', { text: '실행 중인 app.exe 를 끕니다.' }), mk('kill', { name: 'app.exe' }), mk('timeout', { sec: 2 })]),
      mk('run', { path: 'C:\\Program Files\\App\\app.exe', args: '', wait: 'n' }),
      mk('echo', { text: '다시 실행했습니다.' })]; } },
    { name: '파일 개수 세기 (반복 안에서 변수 바꾸기)', build: function () { return [
      mk('setcalc', { name: 'COUNT', expr: '0' }),
      mk('for_files', { dir: '.', pattern: '*.txt', v: 'F' }, [mk('setcalc', { name: 'COUNT', expr: 'COUNT+1' }), mk('echo', { text: '%COUNT%. %%~nxF' })]),
      mk('echo', { text: '텍스트 파일은 모두 %COUNT%개입니다.' })]; } },
    { name: '함수로 여러 폴더 백업', build: function () { return [
      mk('callsub', { name: 'BACKUP', args: '"C:\\work\\docs"' }),
      mk('callsub', { name: 'BACKUP', args: '"C:\\work\\photos"' }),
      mk('echo', { text: '모두 끝났습니다.' }),
      mk('func', { name: 'BACKUP' }, [mk('echo', { text: '%~1 백업 중...' }), mk('xcopy', { src: '%~1', dst: 'D:\\backup\\%~n1' })])]; } }
  ];
  function loadPreset(i) {
    var p = PRESETS[i];
    if (!p) return;
    if (ws.blocks.length && !confirm('지금 블록을 예제 "' + p.name + '"(으)로 바꿀까요?\n(되돌리기로 돌아올 수 있습니다)')) return;
    pushUndo();
    ws = { blocks: p.build() };
    selectedId = null; cursor = rootEnd();
    saveAndRender();
  }

  // 예전 버전에서 블록으로 넣었던 관리자 재실행·자기 삭제를 옵션으로 옮김
  function migrate() {
    var moved = false;
    ws.blocks = ws.blocks.filter(function (b) {
      if (b.type === 'runas') { $('optAdmin').checked = true; moved = true; return false; }
      if (b.type === 'selfdel') { $('optSelfDel').checked = true; moved = true; return false; }
      return true;
    });
    if (moved) { if (form) form.save(); Portal.store.set('workspace', ws); }
  }

  // ================= 툴바 · 파일 =================
  var OPT_IDS = { echoOff: 'optEchoOff', cdSelf: 'optCdSelf', admin: 'optAdmin', pauseEnd: 'optPauseEnd', selfDel: 'optSelfDel' };
  function baseName() { return $('bbFilename').value.trim().replace(/\.(bat|cmd|json)$/i, '') || 'run'; }
  function download(data, fname) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function flush() { clearTimeout(genTimer); refreshCode(); }
  function errorsOk() {
    var errs = lastIssues.filter(function (x) { return !x.warn; });
    return !errs.length || confirm('고칠 곳이 ' + errs.length + '개 있습니다 (오른쪽 코드 아래 빨간 목록).\n그래도 계속할까요?');
  }

  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;
  $('btnPreset').onclick = function () { loadPreset(+$('bbPreset').value); };
  $('btnReset').onclick = function () {
    if (ws.blocks.length && !confirm('모든 블록을 지우고 새로 시작할까요?\n(되돌리기로 돌아올 수 있습니다)')) return;
    pushUndo(); ws = { blocks: [] }; selectedId = null; cursor = rootEnd(); saveAndRender();
  };
  $('btnCopy').onclick = function () { flush(); if (errorsOk()) Portal.copy($('out').dataset.raw || '', this); };
  $('btnExport').onclick = function () {
    var o = { version: 2, options: {}, blocks: ws.blocks };
    Object.keys(OPT_IDS).forEach(function (k) { o.options[k] = $(OPT_IDS[k]).checked; });
    download(JSON.stringify(o, null, 2), baseName() + '.json');
  };
  $('btnImportTrigger').onclick = function () { $('fileImport').click(); };
  $('fileImport').onchange = function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.blocks)) throw new Error('invalid');
        pushUndo();
        if (data.options) Object.keys(OPT_IDS).forEach(function (k) { if (k in data.options) $(OPT_IDS[k]).checked = !!data.options[k]; });
        ws = sanitize(data);
        migrate();
        if (form) form.save();
        selectedId = null; cursor = rootEnd();
        saveAndRender();
      } catch (err) { alert('올바른 조립기 JSON 파일이 아닙니다.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  $('btnDownload').onclick = function () {
    flush();
    if (!errorsOk()) return;
    // 줄바꿈은 CRLF 로 (LF 만 있으면 GOTO/CALL :라벨 이 가끔 엉뚱하게 동작합니다)
    var code = $('out').dataset.raw.replace(/\r?\n/g, '\r\n'), data;
    if (getEncoding() === 'cp949') {
      var r = encodeCp949(code);
      if (!r) { alert('이 브라우저는 ANSI(CP949) 저장을 지원하지 않습니다. "한글 저장 방식"을 UTF-8로 바꿔 주세요.'); return; }
      if (r.bad.length && !confirm('ANSI(CP949)로 표현할 수 없는 글자(' + r.bad.join(' ') + ')는 ?로 바뀝니다. 그래도 받을까요?\n\n취소하고 "한글 저장 방식"을 UTF-8로 바꾸면 그대로 저장됩니다.')) return;
      data = r.bytes;
    } else {
      data = code; // UTF-8, BOM 없이 (BOM 이 있으면 cmd 가 첫 줄을 명령어로 인식하지 못함)
    }
    var fname = $('bbFilename').value.trim() || 'run.bat';
    if (!/\.(bat|cmd)$/i.test(fname)) fname += '.bat';
    download(data, fname);
  };

  // 코드 줄 클릭 → 그 블록 선택
  $('out').addEventListener('click', function (e) {
    if (String(window.getSelection ? window.getSelection() : '').length) return;
    var ln = e.target.closest('.bb-ln'), id = ln && ln.getAttribute('data-id');
    if (!id || id === 'hat' || id === 'end') return;
    var f = findBlock(id);
    if (!f) return;
    selectedId = id; cursor = { parent: f.parentId, branch: f.branch, index: f.index + 1 };
    render();
    select(id, true);
  });
  // 고칠 곳 목록 클릭 → 그 블록으로
  $('msg').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-i]');
    if (!li) return;
    var it = lastIssues[+li.getAttribute('data-i')];
    if (it) select(it.id, true);
  });
  // 시작/끝 모자 블록: 클릭하면 맨 앞/맨 끝에 커서, 블록을 놓으면 그 자리에
  $('wsHat').addEventListener('click', function (e) { if (!isFormEl(e.target)) setCursor(null, 'children', 0); });
  $('wsEnd').addEventListener('click', function (e) { if (!isFormEl(e.target)) setCursor(null, 'children', ws.blocks.length); });
  dropZone($('wsHat'), null, 'children', function () { return 0; });
  dropZone($('wsEnd'), null, 'children', function () { return ws.blocks.length; });

  document.querySelector('.bb-search').addEventListener('input', function () { renderPalette(this.value); });
  $('bbForm').addEventListener('change', function (e) { if (e.target.closest('#wsHat,#wsEnd,.bb-toolbar-row')) scheduleGen(); });
  document.addEventListener('dragend', clearDropHints);
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    var mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (!selectedId) return;
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); removeBlock(selectedId); }
    else if (mod && k === 'd') { e.preventDefault(); duplicate(selectedId); }
    else if (k === 'escape') select(null);
  });

  // ================= 시작 =================
  $('bbPreset').innerHTML = PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + '</option>'; }).join('');
  if (!$('bbFilename').value) $('bbFilename').value = 'run.bat';
  form = Portal.persist($('bbForm'));
  // 저장 방식은 따로도 기억해 둡니다 (예전 버전 호환)
  $('optEncoding').value = Portal.store.get('encoding', $('optEncoding').value) === 'utf8' ? 'utf8' : 'cp949';
  $('optEncoding').addEventListener('change', function () { Portal.store.set('encoding', getEncoding()); });
  migrate();
  cursor = rootEnd();
  renderPalette('');
  saveAndRender();
})();
