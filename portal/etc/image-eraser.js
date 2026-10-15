/* 이미지 지우개·배경 지우개 공용 (portal/etc/image-eraser.html, portal/etc/bg-eraser.html)
 * - 이미지 지우개: 고른 부분(마스크)을 주변과 어울리게 채운다.
 * - 배경 지우개(#ieCard data-mode="bg"): 마스크 = 남길 부분. 나머지를 투명하게 해 PNG로 내보낸다.
 * - 이미지는 어디로도 보내지 않는다. 모든 처리는 이 브라우저 안에서만.
 * - AI 선택(SlimSAM)·AI 지우기(MI-GAN)는 처음 쓸 때만 엔진과 모델을 인터넷에서 받아 브라우저에 보관한다.
 *   받지 못하면 선택은 브러시(배경 지우개는 색으로 지우기도)로, 지우기는 기본 방식(주변 무늬를 옮겨 와 채우기)으로 동작한다.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 설정 ----------
  var ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';
  var HF = 'https://huggingface.co/';
  var MODELS = {
    samEnc: { url: HF + 'Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder_quantized.onnx', size: 8882165 },
    samDec: { url: HF + 'Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder_quantized.onnx', size: 4903810 },
    migan: { url: HF + 'andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx', size: 28079181 }
  };
  var CACHE = 'portal-image-eraser-v1';   // 받은 모델 보관 (Cache Storage)
  var MAX_PX = 16e6;                      // 이보다 큰 이미지는 줄여서 연다
  var UNDO_MAX = 30, UNDO_BYTES = 300e6;
  var BG = $('ieCard').getAttribute('data-mode') === 'bg';
  var HINT = BG ? {
    ai: '남길 물체를 클릭하면 나머지가 투명해집니다. 더 클릭하면 함께 남고, Shift+클릭(또는 오른쪽 클릭)은 그 부분을 투명하게.',
    color: '배경을 클릭하면 비슷한 색이 투명해집니다. 도장·서명처럼 글자 안쪽까지 지우려면 "같은 색 전체". Shift+클릭은 되살리기.',
    erase: '투명하게 할 부분을 문지르세요.',
    brush: '흐리게 보이는 지워진 부분을 칠해 되살립니다.'
  } : {
    ai: '지울 물체를 클릭하면 AI가 그 물체를 골라 줍니다. Shift+클릭(또는 오른쪽 클릭)은 선택에서 빼기.',
    brush: '지울 부분을 칠하세요.',
    erase: '칠한 선택을 문질러 덜어냅니다.'
  };

  // ---------- 상태 ----------
  var imgCv = $('ieImg'), maskCv = $('ieMask'), wrap = $('ieWrap'), stage = $('ieStage'), cursor = $('ieCursor');
  var imgCtx = imgCv.getContext('2d'), maskCtx = maskCv.getContext('2d');
  var prevCv = document.createElement('canvas'), prevCtx = prevCv.getContext('2d'); // 마지막으로 확정된 선택 (되돌리기 기록용)
  var W = 0, H = 0, srcName = 'image', srcType = 'image/png';
  var imgVer = 0, undoStack = [], busy = false, stroke = null, emb = null;
  var maskRGB = [229, 72, 77];
  var miganFail = null; // AI 지우기를 못 쓰게 된 사유 (새로고침 전까지 기본 방식 사용)
  // 배경 지우개 전용: 결과 미리보기(이미지 ∩ 남길 부분), 아직 손대지 않은 상태인지, 원본 픽셀 캐시
  var viewCv = $('ieView'), viewCtx = viewCv ? viewCv.getContext('2d') : null, viewQ = false, bgFresh = false, pixCache = null;

  // ---------- 공통 ----------
  function msg(kind, text) { var m = $('msg'); m.className = text ? 'msg ' + kind : 'msg'; m.textContent = text || ''; }
  function setBusy(text) { busy = !!text; $('ieBusy').hidden = !text; $('ieBusyText').textContent = text || ''; syncButtons(); }
  function busyText(text) { if (busy) $('ieBusyText').textContent = text; }
  function later(v) { return new Promise(function (ok) { setTimeout(function () { ok(v); }, 40); }); } // 화면을 한 번 그리게 양보
  function mb(n) { return (n / 1048576).toFixed(1); }
  function errText(e) { return (e && e.message) || String(e); }
  function tool() { var r = document.querySelector('input[name="ieTool"]:checked'); return r ? r.value : 'brush'; }
  function brushPx() { return +$('ieSize').value || 40; }

  function syncTool() {
    var t = tool(), pick = t === 'ai' || t === 'color';
    $('ieHint').textContent = HINT[t] + ' · Ctrl+Z 되돌리기';
    $('ieSizeVal').textContent = brushPx();
    $('ieSizeBox').style.display = pick ? 'none' : '';
    if ($('ieTolBox')) { $('ieTolBox').style.display = t === 'color' ? '' : 'none'; $('ieTolVal').textContent = $('ieTol').value; }
    wrap.classList.toggle('ie-pick', pick);
  }
  function syncButtons() {
    $('ieUndo').disabled = busy || !undoStack.length;
    ['ieClear', 'ieRun', 'ieSave', 'ieCopy', 'ieOpen'].forEach(function (id) { var b = $(id); if (b) b.disabled = busy || !W; });
  }
  function readMaskColor() { // 선택 표시 색 = --danger 토큰 (형식에 상관없이 RGB로 풀기)
    var c = document.createElement('canvas'); c.width = c.height = 1;
    var x = c.getContext('2d'), v = getComputedStyle(document.body).getPropertyValue('--danger').trim();
    x.fillStyle = '#e5484d'; if (v) x.fillStyle = v;
    x.fillRect(0, 0, 1, 1);
    var d = x.getImageData(0, 0, 1, 1).data; maskRGB = [d[0], d[1], d[2]];
  }
  function maskCss() { return 'rgb(' + maskRGB.join(',') + ')'; }

  // ---------- 이미지 열기 ----------
  function openFile(f) {
    if (!f || busy) return;
    if (!/^image\//.test(f.type || '')) { msg('err', '이미지 파일만 열 수 있습니다.'); return; }
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      srcName = (f.name || '').replace(/\.[^.]*$/, '') || 'image';
      srcType = /^image\/(jpeg|webp)$/.test(f.type) ? f.type : 'image/png';
      setImage(im);
    };
    im.onerror = function () { URL.revokeObjectURL(url); msg('err', '이미지를 열 수 없습니다. (지원하지 않는 형식)'); };
    im.src = url;
  }

  function setImage(im) {
    var w = im.naturalWidth, h = im.naturalHeight, note = '';
    if (!w || !h) { msg('err', '이미지 크기를 읽을 수 없습니다.'); return; }
    if (w * h > MAX_PX) {
      var k = Math.sqrt(MAX_PX / (w * h)), ow = w, oh = h;
      w = Math.floor(w * k); h = Math.floor(h * k);
      note = '이미지가 커서 ' + ow + '×' + oh + ' → ' + w + '×' + h + '로 줄여서 열었습니다.';
    }
    W = w; H = h;
    [imgCv, maskCv, prevCv, viewCv].forEach(function (c) { if (c) { c.width = W; c.height = H; } });
    imgCtx.imageSmoothingQuality = 'high';
    imgCtx.drawImage(im, 0, 0, W, H);
    undoStack = []; imgVer++; emb = null; stroke = null; pixCache = null;
    readMaskColor();
    if (BG) { fullKeep(); bgFresh = true; }
    renderView();
    $('ieEmpty').hidden = true; $('ieEditor').hidden = false; $('ieOpen').hidden = false;
    fit(); syncButtons();
    msg(note ? 'ok' : '', note);
    // 이미지가 화면 아래로 잘리면 도구 줄이 맨 위에 오도록 내려 준다
    if (wrap.getBoundingClientRect().bottom > window.innerHeight) $('ieTools').scrollIntoView({ block: 'start' });
  }

  function fit() { // 화면 폭·높이에 맞춰 표시 크기만 조절 (작은 이미지는 최대 2배)
    if (!W) return;
    var aw = stage.clientWidth || W, ah = Math.max(260, window.innerHeight - 180);
    var s = Math.min(aw / W, ah / H, 2);
    wrap.style.width = Math.max(1, Math.round(W * s)) + 'px';
    wrap.style.height = Math.max(1, Math.round(H * s)) + 'px';
  }

  // ---------- 브러시 ----------
  function pt(e) {
    var r = maskCv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, k: W / r.width };
  }
  function moveCursor(e) {
    var t = tool();
    if (!W || t === 'ai' || t === 'color') { cursor.style.display = 'none'; return; }
    var r = wrap.getBoundingClientRect(), d = brushPx();
    cursor.style.display = 'block';
    cursor.style.width = cursor.style.height = d + 'px';
    cursor.style.left = (e.clientX - r.left - d / 2) + 'px';
    cursor.style.top = (e.clientY - r.top - d / 2) + 'px';
  }
  function paint(a, b) {
    var c = maskCtx, bx = stroke.box;
    c.save();
    c.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    c.fillStyle = c.strokeStyle = maskCss();
    c.lineCap = c.lineJoin = 'round';
    c.lineWidth = stroke.r * 2;
    c.beginPath();
    if (a === b) { c.arc(a.x, a.y, stroke.r, 0, Math.PI * 2); c.fill(); }
    else { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    c.restore();
    bx[0] = Math.min(bx[0], b.x); bx[1] = Math.min(bx[1], b.y);
    bx[2] = Math.max(bx[2], b.x); bx[3] = Math.max(bx[3], b.y);
    if (BG) queueView();
  }
  function endStroke() {
    if (!stroke) return;
    var s = stroke, r = s.r + 2; stroke = null;
    commitMask([s.box[0] - r, s.box[1] - r, s.box[2] + r, s.box[3] + r]);
  }

  maskCv.addEventListener('pointerdown', function (e) {
    if (!W || busy) return;
    var p = pt(e), t = tool();
    if (t === 'ai' || t === 'color') {
      if (e.button === 0 || e.button === 2) {
        e.preventDefault();
        var alt = e.button === 2 || e.shiftKey || e.altKey;
        if (t === 'ai') aiSelect(p, alt); else colorPick(p, alt);
      }
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    try { maskCv.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
    stroke = { erase: t === 'erase', r: brushPx() * p.k / 2, last: p, box: [p.x, p.y, p.x, p.y] };
    paint(p, p);
  });
  maskCv.addEventListener('pointermove', function (e) {
    moveCursor(e);
    if (!stroke) return;
    var p = pt(e);
    paint(stroke.last, p); stroke.last = p;
  });
  maskCv.addEventListener('pointerup', endStroke);
  maskCv.addEventListener('pointercancel', endStroke);
  maskCv.addEventListener('lostpointercapture', endStroke);
  maskCv.addEventListener('pointerleave', function () { cursor.style.display = 'none'; });
  maskCv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- 선택(마스크) 확정·되돌리기 ----------
  function rectOf(b) {
    var x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1]));
    var x1 = Math.min(W, Math.ceil(b[2])), y1 = Math.min(H, Math.ceil(b[3]));
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  // 바뀐 범위를 확정하고, 바뀌기 전 모습을 되돌리기에 쌓는다
  // 이미지 지우개는 0/255로 정리(보이는 그대로 지워지게), 배경 지우개는 부드러운 가장자리를 그대로 둔다
  function commitMask(box) {
    var r = rectOf(box), i;
    if (!r) { renderView(); return; }
    var before = prevCtx.getImageData(r.x, r.y, r.w, r.h), bd = before.data;
    var cur = maskCtx.getImageData(r.x, r.y, r.w, r.h), d = cur.data, changed = false;
    if (BG) {
      for (i = 3; i < d.length; i += 4) if (d[i] !== bd[i]) { changed = true; break; }
    } else {
      for (i = 0; i < d.length; i += 4) {
        var on = d[i + 3] >= 128 ? 255 : 0;
        d[i] = maskRGB[0]; d[i + 1] = maskRGB[1]; d[i + 2] = maskRGB[2]; d[i + 3] = on;
        if (on !== bd[i + 3]) changed = true;
      }
      maskCtx.putImageData(cur, r.x, r.y);
    }
    if (changed) {
      prevCtx.putImageData(cur, r.x, r.y);
      pushUndo({ x: r.x, y: r.y, mask: before, fresh: bgFresh });
      bgFresh = false;
    }
    renderView();
  }
  function undoBytes(u) { return (u.mask ? u.mask.data.length : 0) + (u.img ? u.img.data.length : 0); }
  function pushUndo(u) {
    undoStack.push(u);
    var total = 0; undoStack.forEach(function (v) { total += undoBytes(v); });
    while (undoStack.length > 1 && (undoStack.length > UNDO_MAX || total > UNDO_BYTES)) total -= undoBytes(undoStack.shift());
    syncButtons();
  }
  function undo() {
    if (busy || stroke) return;
    var u = undoStack.pop(); if (!u) return;
    if (u.img) { imgCtx.putImageData(u.img, u.x, u.y); imgVer++; }
    if (u.mask) { maskCtx.putImageData(u.mask, u.x, u.y); prevCtx.putImageData(u.mask, u.x, u.y); }
    if (u.fresh !== undefined) bgFresh = u.fresh;
    renderView(); msg('', ''); syncButtons();
  }
  function holeBox() { // 선택된 부분의 범위 (없으면 null)
    var d = maskCtx.getImageData(0, 0, W, H).data, x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (var y = 0; y < H; y++) {
      for (var x = 0, i = y * W * 4 + 3; x < W; x++, i += 4) {
        if (d[i] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function clearSel() {
    if (!W || busy) return;
    if (BG) { // 배경 지우개의 [처음으로]: 전부 다시 남기기
      if (bgFresh) return;
      var all = prevCtx.getImageData(0, 0, W, H);
      fullKeep();
      pushUndo({ x: 0, y: 0, mask: all, fresh: false });
      bgFresh = true; renderView(); msg('', '');
      return;
    }
    var b = holeBox(); if (!b) return;
    var before = prevCtx.getImageData(b.x, b.y, b.w, b.h);
    maskCtx.clearRect(b.x, b.y, b.w, b.h); prevCtx.clearRect(b.x, b.y, b.w, b.h);
    pushUndo({ x: b.x, y: b.y, mask: before });
    msg('', '');
  }

  // ---------- 배경 지우개: 남길 부분·미리보기·색으로 지우기 ----------
  function fullKeep() {
    maskCtx.save(); maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = maskCss(); maskCtx.fillRect(0, 0, W, H); maskCtx.restore();
    prevCtx.clearRect(0, 0, W, H); prevCtx.drawImage(maskCv, 0, 0);
  }
  function renderView() { // 결과 = 이미지 ∩ 남길 부분 (지워진 곳은 아래에 흐린 원본 + 체크무늬)
    if (!viewCtx || !W) return;
    viewCtx.save();
    viewCtx.globalCompositeOperation = 'copy';
    viewCtx.drawImage(imgCv, 0, 0);
    viewCtx.globalCompositeOperation = 'destination-in';
    viewCtx.drawImage(maskCv, 0, 0);
    viewCtx.restore();
  }
  function queueView() { // 브러시로 칠하는 동안은 화면 그리는 때에 맞춰 한 번씩만
    if (!viewCtx || viewQ) return;
    viewQ = true;
    requestAnimationFrame(function () { viewQ = false; renderView(); });
  }
  function imgPixels() {
    if (!pixCache || pixCache.ver !== imgVer) pixCache = { ver: imgVer, data: imgCtx.getImageData(0, 0, W, H).data };
    return pixCache.data;
  }
  // 클릭한 곳의 색과 비슷한 부분을 투명하게 (restore면 되살리기)
  function colorPick(p, restore) {
    var cx = Math.floor(p.x), cy = Math.floor(p.y), x, y, i;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    msg('', '');
    var sc = document.querySelector('input[name="ieScope"]:checked');
    var d = imgPixels(), th = (+$('ieTol').value || 30) * 2.2, th2 = th * th, whole = sc && sc.value === 'all';
    var r = 0, g = 0, b = 0, k = 0;
    for (y = Math.max(0, cy - 1); y <= Math.min(H - 1, cy + 1); y++) {
      for (x = Math.max(0, cx - 1); x <= Math.min(W - 1, cx + 1); x++) { i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; k++; }
    }
    r /= k; g /= k; b /= k;
    var n = W * H, sel = new Uint8Array(n), x0 = W, y0 = H, x1 = -1, y1 = -1;
    var near = function (j) { var q = j * 4, dr = d[q] - r, dg = d[q + 1] - g, db = d[q + 2] - b; return dr * dr + dg * dg + db * db <= th2; };
    var mark = function (j) {
      sel[j] = 1;
      var xx = j % W, yy = (j - xx) / W;
      if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
    };
    if (whole) {
      for (i = 0; i < n; i++) if (near(i)) mark(i);
    } else { // 클릭한 곳에서 이어진 부분만 (4방향 채우기)
      var q = new Int32Array(n), head = 0, tail = 0, s = cy * W + cx;
      mark(s); q[tail++] = s;
      while (head < tail) {
        var j = q[head++], jx = j % W;
        if (jx > 0 && !sel[j - 1] && near(j - 1)) { mark(j - 1); q[tail++] = j - 1; }
        if (jx < W - 1 && !sel[j + 1] && near(j + 1)) { mark(j + 1); q[tail++] = j + 1; }
        if (j >= W && !sel[j - W] && near(j - W)) { mark(j - W); q[tail++] = j - W; }
        if (j + W < n && !sel[j + W] && near(j + W)) { mark(j + W); q[tail++] = j + W; }
      }
    }
    if (x1 < 0) return;
    var rc = rectOf([x0, y0, x1 + 1, y1 + 1]), md = maskCtx.getImageData(rc.x, rc.y, rc.w, rc.h), mdd = md.data;
    for (y = 0; y < rc.h; y++) {
      for (x = 0; x < rc.w; x++) {
        if (!sel[(y + rc.y) * W + x + rc.x]) continue;
        i = (y * rc.w + x) * 4;
        if (restore) { mdd[i] = maskRGB[0]; mdd[i + 1] = maskRGB[1]; mdd[i + 2] = maskRGB[2]; mdd[i + 3] = 255; }
        else mdd[i + 3] = 0;
      }
    }
    maskCtx.putImageData(md, rc.x, rc.y);
    commitMask([rc.x, rc.y, rc.x + rc.w, rc.y + rc.h]);
  }

  // ---------- AI 엔진·모델 ----------
  var ortP = null, sessP = {};
  function loadOrt() {
    if (!ortP) {
      ortP = new Promise(function (ok, no) {
        if (window.ort) { ok(); return; }
        busyText('AI 엔진 불러오는 중…');
        var s = document.createElement('script');
        s.src = ORT_BASE + 'ort.wasm.min.js';
        s.onload = function () { if (window.ort) ok(); else no(new Error('AI 엔진을 불러오지 못했습니다.')); };
        s.onerror = function () { s.remove(); no(new Error('AI 엔진을 받지 못했습니다. 인터넷 연결이나 cdn.jsdelivr.net 차단 여부를 확인하세요.')); };
        document.head.appendChild(s);
      }).then(function () {
        if (window.ort.env && window.ort.env.wasm) { window.ort.env.wasm.wasmPaths = ORT_BASE; window.ort.env.wasm.numThreads = 1; }
      });
      ortP.catch(function () { ortP = null; });
    }
    return ortP;
  }
  function cacheGet(url) {
    try {
      if (!window.caches) return Promise.resolve(null);
      return window.caches.open(CACHE)
        .then(function (c) { return c.match(url); })
        .then(function (r) { return r ? r.arrayBuffer() : null; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function cachePut(url, buf) {
    try {
      if (window.caches) window.caches.open(CACHE).then(function (c) { return c.put(url, new Response(buf)); }).catch(function () {});
    } catch (e) { /* 보관 못 해도 이번에는 그대로 쓴다 */ }
  }
  function getModel(key, label) {
    var url = MODELS[key].url;
    return cacheGet(url).then(function (hit) {
      if (hit) return hit;
      busyText(label + ' 받는 중… (처음 한 번만)');
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error(label + '을(를) 받지 못했습니다. (HTTP ' + res.status + ')');
        var total = +res.headers.get('Content-Length') || MODELS[key].size;
        if (!res.body || !res.body.getReader) return res.arrayBuffer();
        var rd = res.body.getReader(), parts = [], got = 0;
        var pump = function () {
          return rd.read().then(function (r) {
            if (r.done) return;
            parts.push(r.value); got += r.value.length;
            busyText(label + ' 받는 중… ' + mb(got) + ' / ' + mb(total) + 'MB (처음 한 번만)');
            return pump();
          });
        };
        return pump().then(function () {
          var u = new Uint8Array(got), o = 0;
          parts.forEach(function (p) { u.set(p, o); o += p.length; });
          return u.buffer;
        });
      }, function () {
        throw new Error(label + '을(를) 받지 못했습니다. 인터넷 연결이나 huggingface.co 차단 여부를 확인하세요.');
      }).then(function (buf) { cachePut(url, buf); return buf; });
    });
  }
  function session(key, label) {
    if (!sessP[key]) {
      sessP[key] = loadOrt().then(function () { return getModel(key, label); }).then(function (buf) {
        busyText(label + ' 준비 중…');
        return later().then(function () {
          return window.ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
        });
      });
      sessP[key].catch(function () { sessP[key] = null; });
    }
    return sessP[key];
  }

  // ---------- AI 선택 (SlimSAM: 클릭 한 번 → 그 물체) ----------
  function samInput() { // 긴 변 1024로 줄이고 정규화, 나머지는 0으로 채운 1024×1024
    var s = 1024 / Math.max(W, H);
    var rw = Math.max(1, Math.floor(+(W * s).toFixed(2))), rh = Math.max(1, Math.floor(+(H * s).toFixed(2)));
    var c = document.createElement('canvas'); c.width = rw; c.height = rh;
    var cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(imgCv, 0, 0, rw, rh);
    var d = cx.getImageData(0, 0, rw, rh).data, S = 1024 * 1024, f = new Float32Array(3 * S);
    var M = [0.485, 0.456, 0.406], SD = [0.229, 0.224, 0.225];
    for (var y = 0; y < rh; y++) {
      for (var x = 0; x < rw; x++) {
        var i = (y * rw + x) * 4, j = y * 1024 + x;
        f[j] = (d[i] / 255 - M[0]) / SD[0];
        f[S + j] = (d[i + 1] / 255 - M[1]) / SD[1];
        f[2 * S + j] = (d[i + 2] / 255 - M[2]) / SD[2];
      }
    }
    return { data: f, rw: rw, rh: rh };
  }
  function embedding() { // 이미지가 바뀌지 않았으면 분석 결과 재사용
    if (emb && emb.ver === imgVer) return Promise.resolve(emb);
    var enc;
    return session('samEnc', 'AI 선택 모델(1/2)').then(function (s) {
      enc = s; return session('samDec', 'AI 선택 모델(2/2)');
    }).then(function (dec) {
      busyText('이미지 분석 중…');
      return later().then(function () {
        var ver = imgVer, px = samInput(), feeds = {};
        feeds[enc.inputNames[0]] = new window.ort.Tensor('float32', px.data, [1, 3, 1024, 1024]);
        return enc.run(feeds).then(function (out) {
          emb = { ver: ver, rw: px.rw, rh: px.rh, out: out, dec: dec };
          return emb;
        });
      });
    });
  }
  function aiSelect(p, minus) {
    msg('', '');
    setBusy('AI 선택 준비 중…');
    embedding().then(function (e) {
      busyText('선택 영역 찾는 중…');
      var T = window.ort.Tensor, feeds = {
        image_embeddings: e.out.image_embeddings,
        image_positional_embeddings: e.out.image_positional_embeddings,
        input_points: new T('float32', new Float32Array([p.x * e.rw / W, p.y * e.rh / H]), [1, 1, 1, 2]),
        input_labels: new T('int64', new BigInt64Array([BigInt(1)]), [1, 1, 1])
      };
      return e.dec.run(feeds).then(function (o) { return applySam(o.pred_masks, o.iou_scores, e, minus); });
    }).then(function (found) {
      setBusy('');
      if (!found) msg('err', '그 위치에서 고를 물체를 찾지 못했습니다. 브러시로 칠해 주세요.');
    }, function (err) {
      setBusy('');
      if (window.console) console.error(err);
      msg('err', errText(err) + ' → 브러시로 칠해서 선택할 수 있습니다.');
    });
  }
  // 256×256 결과 → (1024 기준) 축소 이미지 크기로 늘려 이진화 → 가장자리 조금 넓혀 원본 크기로 선택에 합치기/빼기
  function applySam(pm, iou, e, minus) {
    var sc = iou.data, best = 0, k;
    for (k = 1; k < sc.length; k++) if (sc[k] > sc[best]) best = k;
    var L = 256, lg = pm.data, off = best * L * L, rw = e.rw, rh = e.rh;
    var bin = new Uint8Array(rw * rh), x0 = rw, y0 = rh, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < rh; y++) {
      var sy = (y + 0.5) / 4 - 0.5, ya = Math.floor(sy), fy = sy - ya, yb = Math.min(ya + 1, L - 1);
      ya = Math.max(ya, 0);
      for (x = 0; x < rw; x++) {
        var sx = (x + 0.5) / 4 - 0.5, xa = Math.floor(sx), fx = sx - xa, xb = Math.min(xa + 1, L - 1);
        xa = Math.max(xa, 0);
        var v = (lg[off + ya * L + xa] * (1 - fx) + lg[off + ya * L + xb] * fx) * (1 - fy) +
                (lg[off + yb * L + xa] * (1 - fx) + lg[off + yb * L + xb] * fx) * fy;
        if (v > 0) {
          bin[y * rw + x] = 1;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y;
        }
      }
    }
    if (x1 < 0) return false;
    var R = BG ? 0 : 3; // 이미지 지우개: 그림자·테두리까지 지우도록 가장자리를 조금 넓힘
    if (R) bin = dilate(bin, rw, rh, R);
    var c = document.createElement('canvas'); c.width = rw; c.height = rh;
    var cx = c.getContext('2d'), id = cx.createImageData(rw, rh), d = id.data;
    for (var i = 0; i < bin.length; i++) {
      if (bin[i]) { d[i * 4] = maskRGB[0]; d[i * 4 + 1] = maskRGB[1]; d[i * 4 + 2] = maskRGB[2]; d[i * 4 + 3] = 255; }
    }
    cx.putImageData(id, 0, 0);
    var kx = W / rw, ky = H / rh;
    var box = [(x0 - R - 1) * kx, (y0 - R - 1) * ky, (x1 + R + 2) * kx, (y1 + R + 2) * ky];
    maskCtx.save();
    if (BG && bgFresh && !minus) { maskCtx.clearRect(0, 0, W, H); box = [0, 0, W, H]; } // 배경 지우개 첫 클릭: 이 물체만 남기기
    maskCtx.globalCompositeOperation = minus ? 'destination-out' : 'source-over';
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.drawImage(c, 0, 0, rw, rh, 0, 0, W, H);
    if (minus && !BG) maskCtx.drawImage(c, 0, 0, rw, rh, 0, 0, W, H); // 빼기는 반쯤 걸친 가장자리까지 확실히
    maskCtx.restore();
    commitMask(box);
    return true;
  }
  function dilate(a, w, h, r) { // 정사각형 팽창 (가로 → 세로)
    var t = new Uint8Array(a.length), o = new Uint8Array(a.length), x, y, k, e;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (!a[y * w + x]) continue;
        for (k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) t[y * w + k] = 1;
      }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        if (!t[y * w + x]) continue;
        for (k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) o[k * w + x] = 1;
      }
    }
    return o;
  }

  // ---------- 지우기 ----------
  function runErase() {
    if (!W || busy) return;
    var b = holeBox();
    if (!b) { msg('err', '지울 부분을 먼저 선택하세요. (AI 선택으로 클릭하거나 브러시로 칠하기)'); return; }
    var m = Math.max(48, Math.max(b.w, b.h)); // 주변을 넉넉히 함께 넘겨 참고하게 함
    var r = rectOf([b.x - m, b.y - m, b.x + b.w + m, b.y + b.h + m]);
    msg('', '');
    setBusy(miganFail ? '지우는 중…' : 'AI 지우기 준비 중…');
    later().then(function () {
      var img = imgCtx.getImageData(r.x, r.y, r.w, r.h), md = maskCtx.getImageData(r.x, r.y, r.w, r.h).data;
      var n = r.w * r.h, hole = new Uint8Array(n), i;
      for (i = 0; i < n; i++) hole[i] = md[i * 4 + 3] >= 128 ? 1 : 0;
      return fill(img.data, hole, r.w, r.h).then(function (res) {
        var before = new ImageData(new Uint8ClampedArray(img.data), r.w, r.h), d = img.data, o = res.data;
        for (i = 0; i < n; i++) {
          if (!hole[i]) continue;
          d[i * 4] = o[i]; d[i * 4 + 1] = o[n + i]; d[i * 4 + 2] = o[2 * n + i]; d[i * 4 + 3] = 255;
        }
        imgCtx.putImageData(img, r.x, r.y);
        var maskBefore = prevCtx.getImageData(r.x, r.y, r.w, r.h);
        maskCtx.clearRect(r.x, r.y, r.w, r.h); prevCtx.clearRect(r.x, r.y, r.w, r.h);
        imgVer++;
        pushUndo({ x: r.x, y: r.y, img: before, mask: maskBefore });
        setBusy('');
        msg('ok', res.note);
      });
    }).catch(function (e) {
      setBusy('');
      if (window.console) console.error(e);
      msg('err', '지우지 못했습니다: ' + errText(e));
    });
  }
  // 결과는 RGB 평면 배열(Uint8, 길이 3n). AI를 못 쓰면 기본 방식
  function fill(rgba, hole, w, h) {
    var basic = function (note) {
      busyText('지우는 중…');
      return later().then(function () { return { data: patchFill(rgba, hole, w, h), note: note }; });
    };
    if (miganFail) return basic('지웠습니다. (기본 방식)');
    return session('migan', 'AI 지우기 모델').then(function (s) {
      busyText('AI로 지우는 중…');
      return later().then(function () { return runMigan(s, rgba, hole, w, h); });
    }).then(function (data) { return { data: data, note: '지웠습니다.' }; }, function (e) {
      miganFail = e;
      if (window.console) console.warn(e);
      return basic('AI 지우기를 쓸 수 없어 기본 방식으로 지웠습니다. (' + errText(e) + ')');
    });
  }
  function runMigan(s, d, hole, w, h) { // MI-GAN 파이프라인: uint8 RGB + 마스크(255=유지, 0=지울 곳), 크기 자유
    var n = w * h, rgb = new Uint8Array(n * 3), m = new Uint8Array(n), i;
    for (i = 0; i < n; i++) {
      rgb[i] = d[i * 4]; rgb[n + i] = d[i * 4 + 1]; rgb[2 * n + i] = d[i * 4 + 2];
      m[i] = hole[i] ? 0 : 255;
    }
    var names = s.inputNames, mName = names.filter(function (x) { return /mask/i.test(x); })[0] || names[1];
    var iName = names.filter(function (x) { return x !== mName; })[0], feeds = {};
    feeds[iName] = new window.ort.Tensor('uint8', rgb, [1, 3, h, w]);
    feeds[mName] = new window.ort.Tensor('uint8', m, [1, 1, h, w]);
    return s.run(feeds).then(function (out) {
      var t = out[s.outputNames[0]];
      if (!t || !t.data || t.data.length !== n * 3) throw new Error('AI 지우기 결과 크기가 맞지 않습니다.');
      return t.data;
    });
  }

  // ---------- 기본 지우기: 주변 무늬를 옮겨 와 채우기 (다중 해상도 PatchMatch) ----------
  var PR = 3; // 패치 반지름 (7×7)
  function patchFill(rgba, hole, w, h) {
    var LIM = 720, s = Math.min(1, LIM / Math.max(w, h));
    var lw = Math.max(1, Math.round(w * s)), lh = Math.max(1, Math.round(h * s));
    var base = resample(rgba, hole, 4, w, h, lw, lh), levels = [base], li, nnf = null;
    while (levels.length < 7) {
      var t = levels[levels.length - 1];
      if (Math.min(t.w, t.h) < 40) break;
      levels.push(resample(t.c, t.m, 3, t.w, t.h, Math.ceil(t.w / 2), Math.ceil(t.h / 2)));
    }
    var rnd = rng(12345);
    diffuse(levels[levels.length - 1]);
    for (li = levels.length - 1; li >= 0; li--) {
      var top = li === levels.length - 1;
      if (!top) upColors(levels[li + 1], levels[li]);
      nnf = solveLevel(levels[li], top ? null : levels[li + 1], nnf, top ? 8 : 4, rnd);
    }
    // 원래 크기로 (구멍 부분만 쓰임)
    var n = w * h, out = new Uint8Array(n * 3), x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (!hole[i]) continue;
        var px = sample(base, (x + 0.5) * lw / w - 0.5, (y + 0.5) * lh / h - 0.5);
        out[i] = px[0]; out[n + i] = px[1]; out[2 * n + i] = px[2];
      }
    }
    return out;
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 영역 평균으로 크기 변경. 구멍이 하나라도 섞이면 구멍. c: 픽셀당 st칸(RGBA=4, 레벨=3)
  function resample(c, m, st, sw, sh, nw, nh) {
    var o = { w: nw, h: nh, c: new Float32Array(nw * nh * 3), m: new Uint8Array(nw * nh) };
    for (var y = 0; y < nh; y++) {
      var ys = Math.floor(y * sh / nh), ye = Math.max(ys + 1, Math.floor((y + 1) * sh / nh));
      for (var x = 0; x < nw; x++) {
        var xs = Math.floor(x * sw / nw), xe = Math.max(xs + 1, Math.floor((x + 1) * sw / nw));
        var r = 0, g = 0, b = 0, k = 0, hl = 0;
        for (var yy = ys; yy < ye; yy++) {
          for (var xx = xs; xx < xe; xx++) {
            var i = yy * sw + xx;
            if (m[i]) { hl = 1; continue; }
            r += c[i * st]; g += c[i * st + 1]; b += c[i * st + 2]; k++;
          }
        }
        var j = y * nw + x;
        o.m[j] = hl;
        if (k) { o.c[j * 3] = r / k; o.c[j * 3 + 1] = g / k; o.c[j * 3 + 2] = b / k; }
      }
    }
    return o;
  }
  function sample(L, fx, fy) { // 레벨에서 양선형 보간
    var x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    var x1 = Math.min(L.w - 1, Math.max(0, x0 + 1)), y1 = Math.min(L.h - 1, Math.max(0, y0 + 1));
    x0 = Math.min(L.w - 1, Math.max(0, x0)); y0 = Math.min(L.h - 1, Math.max(0, y0));
    var c = L.c, a = (y0 * L.w + x0) * 3, b = (y0 * L.w + x1) * 3, d = (y1 * L.w + x0) * 3, e = (y1 * L.w + x1) * 3, out = [0, 0, 0];
    for (var k = 0; k < 3; k++) {
      out[k] = (c[a + k] * (1 - ax) + c[b + k] * ax) * (1 - ay) + (c[d + k] * (1 - ax) + c[e + k] * ax) * ay;
    }
    return out;
  }
  function diffuse(L) { // 가장 작은 레벨: 바깥에서 안쪽으로 이웃 평균을 번지게
    var w = L.w, h = L.h, n = w * h, c = L.c, done = new Uint8Array(n), left = 0, i;
    for (i = 0; i < n; i++) { done[i] = L.m[i] ? 0 : 1; if (!done[i]) left++; }
    if (left === n) { c.fill(128); return; }
    while (left > 0) {
      var upd = [];
      for (i = 0; i < n; i++) {
        if (done[i]) continue;
        var x = i % w, y = (i - x) / w, r = 0, g = 0, b = 0, k = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            var j = ny * w + nx;
            if (done[j]) { r += c[j * 3]; g += c[j * 3 + 1]; b += c[j * 3 + 2]; k++; }
          }
        }
        if (k) upd.push(i, r / k, g / k, b / k);
      }
      if (!upd.length) break;
      for (var u = 0; u < upd.length; u += 4) {
        var p = upd[u];
        c[p * 3] = upd[u + 1]; c[p * 3 + 1] = upd[u + 2]; c[p * 3 + 2] = upd[u + 3];
        done[p] = 1; left--;
      }
    }
  }
  function upColors(C, F) { // 거친 레벨 결과로 다음 레벨 구멍의 처음 값을 채움
    for (var y = 0; y < F.h; y++) {
      for (var x = 0; x < F.w; x++) {
        var i = y * F.w + x;
        if (!F.m[i]) continue;
        var p = sample(C, (x + 0.5) * C.w / F.w - 0.5, (y + 0.5) * C.h / F.h - 0.5);
        F.c[i * 3] = p[0]; F.c[i * 3 + 1] = p[1]; F.c[i * 3 + 2] = p[2];
      }
    }
  }
  function solveLevel(L, CL, cn, iters, rnd) {
    var w = L.w, h = L.h, n = w * h, m = L.m, c = L.c, i, x, y;
    // 원본 후보: 패치 전체가 이미지 안 + 구멍 없음 (적분 영상으로 확인)
    var I = new Int32Array((w + 1) * (h + 1));
    for (y = 0; y < h; y++) {
      for (x = 0, i = 0; x < w; x++) {
        i += m[y * w + x];
        I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + i;
      }
    }
    var valid = new Uint8Array(n), list = [];
    for (y = PR; y < h - PR; y++) {
      for (x = PR; x < w - PR; x++) {
        var s = I[(y + PR + 1) * (w + 1) + x + PR + 1] - I[(y - PR) * (w + 1) + x + PR + 1] -
                I[(y + PR + 1) * (w + 1) + x - PR] + I[(y - PR) * (w + 1) + x - PR];
        if (!s) { valid[y * w + x] = 1; list.push(y * w + x); }
      }
    }
    var isT = dilate(m, w, h, PR), T = [];
    for (i = 0; i < n; i++) if (isT[i]) T.push(i);
    if (!list.length || !T.length) return null; // 옮겨 올 무늬가 없으면 처음 값 그대로

    var nx = new Int32Array(n), ny = new Int32Array(n), nd = new Float32Array(n), cnt = new Float32Array(n);
    var pick = function () { var v = list[Math.floor(rnd() * list.length)]; return [v % w, (v - v % w) / w]; };
    var dist = function (tx, ty, sx, sy, cut) {
      var sum = 0;
      for (var dy = -PR; dy <= PR; dy++) {
        var qy = ty + dy; if (qy < 0 || qy >= h) continue;
        var tr = qy * w, sr = (sy + dy) * w;
        for (var dx = -PR; dx <= PR; dx++) {
          var qx = tx + dx; if (qx < 0 || qx >= w) continue;
          var a = (tr + qx) * 3, b = (sr + sx + dx) * 3;
          var d0 = c[a] - c[b], d1 = c[a + 1] - c[b + 1], d2 = c[a + 2] - c[b + 2];
          sum += d0 * d0 + d1 * d1 + d2 * d2;
        }
        if (sum > cut) return sum;
      }
      return sum;
    };
    // 처음 대응: 거친 레벨 대응을 2배로 늘리거나, 없으면 무작위
    for (var k = 0; k < T.length; k++) {
      var t = T[k], tx = t % w, ty = (t - tx) / w, sx = -1, sy = -1;
      if (cn && CL) {
        var cx = Math.min(CL.w - 1, Math.floor(tx * CL.w / w)), cy = Math.min(CL.h - 1, Math.floor(ty * CL.h / h)), ci = cy * CL.w + cx;
        if (cn.has[ci]) {
          sx = Math.min(w - 1 - PR, Math.max(PR, cn.x[ci] * 2 + (tx - cx * 2)));
          sy = Math.min(h - 1 - PR, Math.max(PR, cn.y[ci] * 2 + (ty - cy * 2)));
          if (!valid[sy * w + sx]) sx = -1;
        }
      }
      if (sx < 0) { var r0 = pick(); sx = r0[0]; sy = r0[1]; }
      nx[t] = sx; ny[t] = sy;
      cnt[t] = (Math.min(tx + PR, w - 1) - Math.max(tx - PR, 0) + 1) * (Math.min(ty + PR, h - 1) - Math.max(ty - PR, 0) + 1) * 3;
    }

    var pass = function (rev) {
      var len = T.length, dir = rev ? -1 : 1;
      for (var q = 0; q < len; q++) {
        var t = T[rev ? len - 1 - q : q], tx = t % w, ty = (t - tx) / w;
        var bx = nx[t], by = ny[t], bd = nd[t];
        var tryC = function (cx, cy) {
          if (cx < PR || cy < PR || cx >= w - PR || cy >= h - PR || (cx === bx && cy === by) || !valid[cy * w + cx]) return;
          var d = dist(tx, ty, cx, cy, bd);
          if (d < bd) { bd = d; bx = cx; by = cy; }
        };
        // 이웃의 대응을 이어받기
        var ax = tx - dir, ay = ty - dir;
        if (ax >= 0 && ax < w && isT[ty * w + ax]) tryC(nx[ty * w + ax] + dir, ny[ty * w + ax]);
        if (ay >= 0 && ay < h && isT[ay * w + tx]) tryC(nx[ay * w + tx], ny[ay * w + tx] + dir);
        // 범위를 줄여 가며 무작위 탐색
        for (var R = Math.max(w, h); R >= 1; R = Math.floor(R / 2)) {
          tryC(Math.round(bx + (rnd() * 2 - 1) * R), Math.round(by + (rnd() * 2 - 1) * R));
        }
        nx[t] = bx; ny[t] = by; nd[t] = bd;
      }
    };
    var vote = function () {
      var acc = new Float32Array(n * 3), ws = new Float32Array(n), mean = 0, k2, t2;
      for (k2 = 0; k2 < T.length; k2++) { t2 = T[k2]; mean += nd[t2] / cnt[t2]; }
      var s2 = 0.5 * Math.max(mean / T.length, 1); // 잘 맞는 패치 위주로 섞어 흐려지지 않게
      for (k2 = 0; k2 < T.length; k2++) {
        t2 = T[k2];
        var tx = t2 % w, ty = (t2 - tx) / w, sx = nx[t2], sy = ny[t2], wt = Math.exp(-(nd[t2] / cnt[t2]) / s2) + 1e-6;
        for (var dy = -PR; dy <= PR; dy++) {
          var qy = ty + dy; if (qy < 0 || qy >= h) continue;
          for (var dx = -PR; dx <= PR; dx++) {
            var qx = tx + dx; if (qx < 0 || qx >= w) continue;
            var q = qy * w + qx; if (!m[q]) continue;
            var b = ((sy + dy) * w + sx + dx) * 3;
            acc[q * 3] += wt * c[b]; acc[q * 3 + 1] += wt * c[b + 1]; acc[q * 3 + 2] += wt * c[b + 2]; ws[q] += wt;
          }
        }
      }
      for (var p = 0; p < n; p++) {
        if (!m[p] || !ws[p]) continue;
        c[p * 3] = acc[p * 3] / ws[p]; c[p * 3 + 1] = acc[p * 3 + 1] / ws[p]; c[p * 3 + 2] = acc[p * 3 + 2] / ws[p];
      }
    };
    for (var it = 0; it < iters; it++) {
      for (k = 0; k < T.length; k++) { t = T[k]; tx = t % w; nd[t] = dist(tx, (t - tx) / w, nx[t], ny[t], Infinity); }
      pass(false); pass(true);
      vote();
    }
    var has = new Uint8Array(n);
    for (k = 0; k < T.length; k++) has[T[k]] = 1;
    return { x: nx, y: ny, has: has };
  }

  // ---------- 저장·복사 ----------
  function output() { if (BG) { renderView(); return viewCv; } return imgCv; } // 배경 지우개는 투명 결과
  function save() {
    if (!W || busy) return;
    var type = BG ? 'image/png' : srcType, ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
    output().toBlob(function (b) {
      if (!b) { msg('err', '저장 파일을 만들지 못했습니다.'); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = srcName + (BG ? '_투명.' : '_지움.') + ext;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }, type, 0.92);
  }
  function copyImg(btn) {
    if (!W || busy) return;
    if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem) {
      msg('err', '이 브라우저에서는 이미지 복사를 할 수 없습니다. [저장]을 이용하세요.'); return;
    }
    var src = output(), blob = new Promise(function (ok, no) { src.toBlob(function (b) { if (b) ok(b); else no(new Error('blob')); }, 'image/png'); });
    navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(function () {
      btn.textContent = '복사됨';
      setTimeout(function () { btn.textContent = '복사'; }, 1200);
    }, function () { msg('err', '복사하지 못했습니다. [저장]을 이용하세요.'); });
  }

  // ---------- 연결 ----------
  var pickFile = function () { if (!busy) $('ieFile').click(); };
  $('ieEmpty').addEventListener('click', pickFile);
  $('ieEmpty').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
  $('ieOpen').addEventListener('click', pickFile);
  $('ieFile').addEventListener('change', function () { openFile(this.files[0]); this.value = ''; });

  var card = $('ieCard');
  document.addEventListener('dragover', function (e) { e.preventDefault(); card.classList.add('ie-over'); });
  document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) card.classList.remove('ie-over'); });
  document.addEventListener('drop', function (e) {
    e.preventDefault(); card.classList.remove('ie-over');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); openFile(items[i].getAsFile()); return; }
    }
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && tag !== 'TEXTAREA' && !(tag === 'INPUT' && e.target.type === 'text')) {
      e.preventDefault(); undo();
    }
  });

  $('ieTools').addEventListener('change', syncTool);
  $('ieSize').addEventListener('input', function () { $('ieSizeVal').textContent = brushPx(); });
  if ($('ieTol')) $('ieTol').addEventListener('input', function () { $('ieTolVal').textContent = this.value; });
  $('ieUndo').addEventListener('click', undo);
  $('ieClear').addEventListener('click', clearSel);
  if ($('ieRun')) $('ieRun').addEventListener('click', runErase);
  $('ieSave').addEventListener('click', save);
  $('ieCopy').addEventListener('click', function () { copyImg(this); });
  window.addEventListener('resize', fit);

  Portal.persist($('ieTools'));
  syncTool(); syncButtons();
})();
