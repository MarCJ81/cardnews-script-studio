/* ============================================================
   카드뉴스·대본 스튜디오 · app.js
   Canvas 렌더러 + 화면 조작 + PNG/ZIP/SRT 저장 + localStorage 작업함.
   모든 계산은 core.js(StudioCore)에 있고, 여기서는 그리기와 연결만 한다.
   ============================================================ */
(function () {
  'use strict';

  const C = window.StudioCore;
  const FONT = 'PlexKR, "IBM Plex Sans KR", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const STORE = C.STORAGE;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    project: null,
    script: null,
    scriptOut: null,
    srt: '',
    selected: 0,
    tab: 'cards',
    splitCount: 4,
    recs: null,
    ref: null,
    copyInfo: null,
    fw: { id: 'PAS', out: null },
    bridge: { kind: 'cards', parsed: null },
    gemini: { key: '', model: '' },
    v2: { fontMix: 'pretendard-only', grain: 'none', source: { kind: 'preset' }, cards: null },
  };
  const imageCache = new Map();

  const els = {};
  let saveTimer = null;
  let renderTimer = null;
  let toastTimer = null;

  /* ── storage ────────────────────────────────────────────── */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 사생활 모드 */ }
  }

  /* ── small helpers ──────────────────────────────────────── */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const pad2 = n => String(n).padStart(2, '0');

  function toast(message, kind) {
    const root = els.toastRoot;
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    root.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* ── canvas: theme furniture ────────────────────────────── */
  function paintBackground(ctx, W, H, T) {
    const g = ctx.createLinearGradient(0, 0, W * 0.72, H);
    g.addColorStop(0, T.bg);
    g.addColorStop(1, T.bgTo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawDecor(ctx, W, H, T, kind) {
    const a = kind === 'cover' ? 1 : 0.55;
    const pad = Math.round(W * 0.088);
    ctx.save();
    if (T.decor === 'grid') {
      ctx.strokeStyle = C.rgba(T.ink, 0.09 * a);
      ctx.lineWidth = Math.max(1, W * 0.0022);
      ctx.strokeRect(W * 0.017, W * 0.017, W - W * 0.034, H - W * 0.034);
      ctx.fillStyle = C.rgba(T.accent, 0.20 * a);
      const step = Math.round(W * 0.043);
      for (let x = W * 0.52; x < W - pad * 0.5; x += step) {
        for (let y = H * 0.54; y < H - pad * 1.75; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1.2, W * 0.0019), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (T.decor === 'glow') {
      const g = ctx.createRadialGradient(W * 0.84, H * 0.1, 0, W * 0.84, H * 0.1, W * 0.78);
      g.addColorStop(0, C.rgba(T.accent, 0.14 * a));
      g.addColorStop(1, C.rgba(T.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = C.rgba(T.accent, 0.32 * a);
      ctx.lineWidth = Math.max(1.5, W * 0.0028);
      ctx.beginPath();
      ctx.arc(W * 0.93, H * 0.02, W * 0.30, 0, Math.PI * 2);
      ctx.stroke();
    } else if (T.decor === 'rules') {
      ctx.strokeStyle = C.rgba(T.ink, 0.07 * a);
      ctx.lineWidth = Math.max(1, W * 0.0018);
      for (let y = H * 0.115; y < H * 0.95; y += H * 0.088) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = C.rgba(T.accent, 0.30 * a);
      ctx.lineWidth = Math.max(1.5, W * 0.0026);
      ctx.beginPath();
      ctx.arc(W * 0.885, H * 0.155, W * 0.185, 0, Math.PI * 2);
      ctx.stroke();
    } else if (T.decor === 'blob') {
      ctx.fillStyle = C.rgba('#ffffff', 0.09 * a);
      ctx.beginPath();
      ctx.arc(W * 0.9, H * 0.06, W * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.rgba('#000000', 0.06 * a);
      ctx.beginPath();
      ctx.arc(W * 0.04, H * 0.95, W * 0.44, 0, Math.PI * 2);
      ctx.fill();
    } else if (T.decor === 'arcs') {
      ctx.strokeStyle = C.rgba(T.accent, 0.15 * a);
      ctx.lineWidth = Math.max(1.5, W * 0.0026);
      [0.42, 0.56, 0.70, 0.84].forEach(k => {
        ctx.beginPath();
        ctx.arc(W, H, W * k, Math.PI, Math.PI * 1.5);
        ctx.stroke();
      });
      ctx.fillStyle = C.rgba(T.accent, 0.55 * a);
      roundRect(ctx, W - pad - W * 0.03, pad * 0.28, W * 0.03, W * 0.03, W * 0.006);
      ctx.fill();
    } else if (T.decor === 'bars') {
      const heights = [0.05, 0.1, 0.07, 0.15, 0.21];
      const bw = W * 0.024;
      const gap = W * 0.016;
      const baseY = H * 0.90;
      ctx.fillStyle = C.rgba(T.accent, 0.15 * a);
      heights.forEach((hh, i) => {
        const x = W * 0.60 + i * (bw + gap);
        const h = H * hh;
        roundRect(ctx, x, baseY - h, bw, h, bw * 0.28);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  /* ── canvas: text ───────────────────────────────────────── */
  function drawRuns(ctx, runs, x, baseY, size, opts) {
    const T = opts.theme;
    let cx = x;
    runs.forEach(run => {
      const weight = run.em ? (opts.emWeight || 700) : opts.weight;
      ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
      const w = ctx.measureText(run.text).width;
      if (run.em && T.emStyle === 'highlight') {
        const px = size * 0.07;
        ctx.fillStyle = C.rgba(T.accent, opts.highlightAlpha || 0.16);
        roundRect(ctx, cx - px, baseY - size * 0.80, w + px * 2, size * 0.99, size * 0.12);
        ctx.fill();
      }
      ctx.fillStyle = run.em ? T.accent : opts.color;
      ctx.fillText(run.text, cx, baseY);
      if (run.em && T.emStyle === 'marker') {
        ctx.fillStyle = C.rgba(T.accent, 0.92);
        ctx.fillRect(cx, baseY + size * 0.15, w, Math.max(2, size * 0.062));
      }
      cx += w;
    });
    return cx;
  }

  function measureLines(ctx, text, size, width, weight, emWeight) {
    const runs = C.parseRuns(text);
    return C.layoutRuns(runs, width, (ch, run) => {
      ctx.font = `${run.em ? (emWeight || weight) : weight} ${Math.round(size)}px ${FONT}`;
      return ctx.measureText(ch).width;
    });
  }

  function flattenBody(ctx, text, size, width, limit) {
    const paras = String(text == null ? '' : text).split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);
    const out = [];
    paras.forEach((para, pi) => {
      const lines = measureLines(ctx, para, size, width, 400, 600);
      lines.forEach(line => out.push({ runs: C.lineToRuns(line), pi }));
    });
    let truncated = false;
    if (out.length > limit) {
      out.length = limit;
      truncated = true;
      const last = out[out.length - 1];
      if (last && last.runs.length) {
        const tail = last.runs[last.runs.length - 1];
        tail.text = tail.text.replace(/\s+$/, '') + '…';
      }
    }
    return { lines: out, truncated };
  }

  /* ── 실사 사진 캐시 ─────────────────────────────────────── */
  function imageFor(src, onReady) {
    if (!src) return null;
    const rec = imageCache.get(src);
    if (rec) return rec.el && rec.el.naturalWidth ? rec.el : null;
    const el = new Image();
    el.decoding = 'async';
    const entry = { el, ready: false, error: false };
    imageCache.set(src, entry);
    el.onload = () => { entry.ready = true; if (onReady) onReady(); };
    el.onerror = () => { entry.error = true; };
    el.src = src;
    return null;
  }

  function loadImage(src) {
    return new Promise(resolve => {
      if (!src) { resolve(null); return; }
      const rec = imageCache.get(src);
      if (rec && rec.el && rec.el.naturalWidth) { resolve(rec.el); return; }
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => { imageCache.set(src, { el, ready: true, error: false }); resolve(el); };
      el.onerror = () => { imageCache.set(src, { el, ready: false, error: true }); resolve(null); };
      el.src = src;
    });
  }

  /* ── canvas: one slide ──────────────────────────────────── */
  function drawSlide(target, project, index, opts) {
    const o = opts || {};
    const design = project.design || {};
    if (design.presetId && window.StudioPreset) {
      const photo = o.imageEl !== undefined
        ? o.imageEl
        : (design.image ? imageFor(design.image, () => { renderStage(); renderList(); }) : null);
      const drawn = window.StudioPreset.draw(target, project, index, { scale: o.scale || 1, imageEl: photo });
      if (drawn) return;
    }
    drawClassicSlide(target, project, index, o);
  }

  function drawClassicSlide(target, project, index, opts) {
    const o = opts || {};
    const R = C.ratioById(project.ratio);
    const T = C.resolveTheme(project);
    const W = R.w;
    const H = R.h;
    const slide = project.slides[index] || project.slides[0];
    if (!slide) return;
    const scale = o.scale || 1;
    target.width = Math.max(2, Math.round(W * scale));
    target.height = Math.max(2, Math.round(H * scale));
    const ctx = target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.scale(scale, scale);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    paintBackground(ctx, W, H, T);
    drawDecor(ctx, W, H, T, slide.kind);

    const pad = Math.round(W * 0.088);
    const innerW = W - pad * 2;
    const isCover = slide.kind === 'cover';
    const isCta = slide.kind === 'cta';

    /* header badge */
    let top = pad;
    const badgeText = String(slide.badge || (isCover ? project.badge : '') || '').trim();
    if (project.showBadge && badgeText) {
      const bSize = Math.round(W * 0.0255);
      ctx.font = `700 ${bSize}px ${FONT}`;
      const label = badgeText.toUpperCase();
      const tw = ctx.measureText(label).width;
      const ph = Math.round(bSize * 2.35);
      const pw = Math.round(tw + bSize * 2.2);
      ctx.fillStyle = T.badgeBg;
      roundRect(ctx, pad, top, pw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = T.badgeInk;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pad + Math.round(bSize * 1.1), top + ph / 2 + bSize * 0.04);
      ctx.textBaseline = 'alphabetic';
      top += ph + Math.round(W * 0.04);
    }

    const footerBaseline = Math.round(H - pad * 0.62);
    const contentTop = top;
    const contentBottom = Math.round(H - pad * 1.42);
    const avail = Math.max(80, contentBottom - contentTop);

    const baseTitle = W * (isCover ? 0.099 : isCta ? 0.093 : 0.083) * (R.id === '9x16' ? 1.12 : R.id === '1x1' ? 0.96 : 1);
    const baseBody = W * (isCover ? 0.0418 : 0.0392) * (R.id === '9x16' ? 1.06 : 1);
    const barIndent = isCover ? 0 : Math.round(W * 0.032);
    const textW = innerW - barIndent;
    const maxTitleLines = R.id === '9x16' ? 4 : isCover ? 3 : 2;
    const maxBodyLines = R.id === '9x16' ? 12 : R.id === '1x1' ? 7 : 9;

    let fit = null;
    const steps = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55];
    for (let i = 0; i < steps.length; i++) {
      const sc = steps[i];
      const ts = Math.round(baseTitle * sc);
      const bs = Math.round(baseBody * Math.max(0.84, sc));
      const tLines = measureLines(ctx, slide.title || '', ts, textW, 700, 700);
      const body = flattenBody(ctx, slide.body || '', bs, textW, maxBodyLines);
      const ruleH = isCover ? 0 : Math.round(W * 0.008) + Math.round(W * 0.03);
      const titleH = tLines.length * Math.round(ts * 1.26);
      const bodyLineGap = Math.round(bs * 1.62);
      const paraGap = Math.round(bs * 0.58);
      const paraBreaks = body.lines.reduce((acc, item, idx) => (idx > 0 && item.pi !== body.lines[idx - 1].pi ? acc + 1 : acc), 0);
      const bodyH = body.lines.length ? body.lines.length * bodyLineGap + paraBreaks * paraGap : 0;
      const gapTB = bodyH ? Math.round(ts * 0.44) : 0;
      const total = ruleH + titleH + gapTB + bodyH;
      fit = { ts, bs, tLines, body, ruleH, titleH, bodyH, gapTB, bodyLineGap, paraGap, total, sc };
      if (tLines.length <= maxTitleLines && total <= avail) break;
    }

    const yStart = contentTop + Math.max(0, (avail - fit.total) * (isCover ? 0.42 : isCta ? 0.46 : 0.5));
    let y = yStart;

    if (fit.ruleH) {
      ctx.fillStyle = C.rgba(T.accent, 0.9);
      roundRect(ctx, pad, y, Math.round(W * 0.072), Math.round(W * 0.0075), Math.round(W * 0.004));
      ctx.fill();
      y += fit.ruleH;
    }

    /* title */
    fit.tLines.forEach(line => {
      drawRuns(ctx, C.lineToRuns(line), pad, y + fit.ts * 0.84, fit.ts, {
        theme: T, weight: 700, emWeight: 700, color: T.ink,
      });
      y += Math.round(fit.ts * 1.26);
    });

    /* body */
    if (fit.body.lines.length) {
      y += fit.gapTB;
      const bodyTop = y;
      if (!isCover) {
        ctx.fillStyle = C.rgba(T.accent, 0.5);
        roundRect(ctx, pad, bodyTop + fit.bs * 0.1, Math.max(3, W * 0.005), Math.max(8, fit.bodyH - fit.bs * 0.2), Math.max(2, W * 0.003));
        ctx.fill();
      }
      let by = bodyTop;
      let prevPi = -1;
      fit.body.lines.forEach(item => {
        if (prevPi >= 0 && item.pi !== prevPi) by += fit.paraGap;
        drawRuns(ctx, item.runs, pad + barIndent, by + fit.bs * 0.8, fit.bs, {
          theme: T, weight: 400, emWeight: 600, color: T.inkSoft,
        });
        by += fit.bodyLineGap;
        prevPi = item.pi;
      });
    }

    /* footer */
    if (project.showHandle || project.showPage) {
      const fSize = Math.round(W * 0.0255);
      const lineY = Math.round(footerBaseline - fSize * 1.7);
      ctx.strokeStyle = C.rgba(T.ink, 0.15);
      ctx.lineWidth = Math.max(1, W * 0.0015);
      ctx.beginPath();
      ctx.moveTo(pad, lineY);
      ctx.lineTo(W - pad, lineY);
      ctx.stroke();
      ctx.font = `600 ${fSize}px ${FONT}`;
      ctx.fillStyle = C.rgba(T.ink, 0.58);
      if (project.showHandle && project.handle) {
        ctx.fillText(project.handle, pad, footerBaseline);
      }
      if (project.showPage) {
        ctx.textAlign = 'right';
        ctx.fillText(C.pageLabel(index, project.slides.length), W - pad, footerBaseline);
        ctx.textAlign = 'left';
      }
    }
  }

  /* ── render: stage ──────────────────────────────────────── */
  function fitCanvas() {
    const canvas = els.preview;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const cs = getComputedStyle(wrap);
    const availW = wrap.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const availH = wrap.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
    const W = canvas.width;
    const H = canvas.height;
    if (availW <= 8 || availH <= 8) return;
    const s = Math.min(availW / W, availH / H);
    canvas.style.width = Math.round(W * s) + 'px';
    canvas.style.height = Math.round(H * s) + 'px';
  }

  function renderStage() {
    const p = state.project;
    const R = C.ratioById(p.ratio);
    drawSlide(els.preview, p, state.selected);
    fitCanvas();
    requestAnimationFrame(fitCanvas);
    els.stageDims.textContent = `${R.w} × ${R.h}`;
    const preset = p.design && p.design.presetId ? C.stylePreset(p.design.presetId) : null;
    els.stageNote.innerHTML = `${R.w} × ${R.h} PNG · ${C.KIND_LABEL[p.slides[state.selected] ? p.slides[state.selected].kind : 'body']}${preset ? ' · <b>' + esc(preset.name) + '</b> 레이아웃' : ' · 강조는 <b>**이렇게**</b> 감쌉니다.'}`;
    $$('#ratioSeg button').forEach(b => {
      const on = b.dataset.ratio === p.ratio;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    els.themeName.textContent = (preset ? preset.name : C.resolveTheme(p).name);
    $$('#themeGrid .theme-btn').forEach(b => {
      const on = b.dataset.themeId === p.theme && !preset;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  /* ── render: AI 추천 레이아웃 ──────────────────────────── */
  function gradeClass(id) { return 'grade-' + String(id || 'd').toLowerCase(); }

  const TRIGGER_SHORT = {
    loss: '손실', anchor: '숫자', curiosity: '호기심', interrupt: '반전',
    social: '증거', scarcity: '희소', authority: '권위', cta: 'CTA',
  };

  function renderRefs() {
    if (!els.refList) return;
    const rec = state.recs;
    const applied = (state.project.design && state.project.design.presetId) || '';
    if (!rec || !rec.ok) {
      els.refList.innerHTML = '';
      els.refCtx.textContent = rec && rec.reason === 'design-engine-missing'
        ? '디자인 엔진을 불러오지 못했습니다. engines/ 폴더를 확인하세요.'
        : '글을 분석해 핀터레스트 스타일 3~4안을 이유와 함께 고릅니다.';
    } else {
      const cx = rec.context;
      els.refCtx.innerHTML = `업종 <b>${esc(cx.industry)}</b> · 무드 <b>${esc(cx.mood)}</b> · 밀도 ${esc(cx.density.level)} · ${esc(cx.density.note)}`;
      els.refList.innerHTML = rec.refs.map(r => `
        <button type="button" class="ref-card${applied === r.id ? ' is-active' : ''}" data-action="apply-design-ref" data-ref-id="${esc(r.id)}" aria-pressed="${applied === r.id}">
          <span class="ref-swatch" style="--a:${esc(r.palette.bg)};--b:${esc(r.palette.accent)};--c:${esc(r.palette.ink)}" aria-hidden="true"></span>
          <span class="ref-main">
            <b>${r.rank}. ${esc(r.name)}</b>
            <em>${esc(r.familyLabel)} · 적합 ${r.percent}% · ${esc(r.structure)}</em>
            <span class="ref-why">${r.reasons.map(x => esc(x)).join(' · ')}</span>
            ${r.risk.flagged ? `<span class="ref-risk">주의 · ${esc(r.risk.label)}</span>` : ''}
          </span>
        </button>`).join('');
    }

    const design = state.project.design || {};
    const preset = design.presetId ? C.stylePreset(design.presetId) : null;
    els.refApplied.hidden = !preset;
    if (preset) {
      els.refAppliedName.textContent = preset.name;
      els.refAppliedNote.textContent = design.note || '적용 중';
    }
    const hasPhoto = !!(design.image && design.image.length > 40);
    els.refPhotoNote.hidden = !hasPhoto;
    if (hasPhoto) els.refPhotoNote.textContent = '실사 사진이 카드에 배치됩니다. 사진이 없는 스타일은 그래픽 블록으로 채웁니다.';
  }

  function renderPalette() {
    if (!els.paletteRow) return;
    const ref = state.ref;
    const theme = state.project.customTheme;
    if (!ref && !theme) { els.paletteRow.hidden = true; els.paletteRow.innerHTML = ''; return; }
    const pal = theme ? theme.palette : (ref && ref.palette);
    if (!pal) { els.paletteRow.hidden = true; return; }
    const pass = ref ? ref.allPass : true;
    const conf = ref ? Math.round((ref.confidence || 0) * 100) : 100;
    const risk = ref ? ref.isDefaultLook : null;
    els.paletteRow.hidden = false;
    els.paletteRow.innerHTML = `
      <div class="pal-swatches">${['bg', 'surface', 'accent', 'ink', 'sub', 'line'].map(k =>
        `<span title="${esc(k)} ${esc(pal[k])}" style="background:${esc(pal[k])}"></span>`).join('')}</div>
      <p class="hint">${theme ? '<b>' + esc(theme.name) + '</b> 색을 쓰는 중' : '추출 신뢰도 <b>' + conf + '%</b>'}
        · ${pass ? '대비 <b>통과</b>' : '대비 <b>보정됨</b>'}
        ${risk && risk.flagged ? ' · <span class="warn-inline">' + esc(risk.label) + '</span>' : ''}</p>
      <div class="btn-row">
        <button type="button" class="mini-btn wide" data-action="apply-palette">${theme ? '색 다시 적용' : '이 색 적용'}</button>
        ${theme ? '<button type="button" class="mini-btn" data-action="clear-palette">색 해제</button>' : ''}
      </div>`;
  }

  /* ── render: 카피 진단 (슬라이드 · 대본) ────────────────── */
  function triggerMini(psych) {
    return psych.triggers.map(t => {
      const lv = t.score >= 70 ? 'strong' : t.score >= 40 ? 'ok' : 'weak';
      const hits = (t.hits || []).map(h => typeof h === 'string' ? h : (h.phrase || h.text || '')).filter(Boolean).slice(0, 2);
      return `<div class="trig" title="${esc(t.name)} ${t.score}점${hits.length ? ' · ' + esc(hits.join(', ')) : ''}">
        <span class="trig-name">${esc(TRIGGER_SHORT[t.id] || t.name)}</span>
        <i class="trig-bar"><b class="${lv}" style="width:${C.clamp(t.score, 0, 100)}%"></b></i>
        <em class="${lv}">${t.score}</em>
      </div>`;
    }).join('');
  }

  function copyTip(info, fallback) {
    if (!info || !info.ok) return fallback || '카피 엔진을 불러오지 못했습니다.';
    if (info.empty) return '제목이나 본문을 먼저 채우세요.';
    const rec = info.psych.recommendations[0];
    const dot = info.friction.count ? ` · 감점 표현 ${info.friction.count}곳` : ' · 감점 표현 없음';
    if (!rec) return info.psych.grade.desc + dot;
    return `<b>${esc(rec.name)}</b> ${rec.current}→${rec.target}점: ${esc(rec.action)}${dot}`;
  }

  function renderCopyMini() {
    if (!els.copyScore) return;
    const slide = state.project.slides[state.selected];
    const text = slide ? [slide.title, slide.body].filter(Boolean).join('\n') : '';
    const info = C.analyzeCopy(text);
    els.copyScore.textContent = info.ok ? info.psych.total : '—';
    els.copyGrade.textContent = info.ok ? info.psych.grade.label : '—';
    els.copyGrade.className = 'grade-chip ' + (info.ok ? gradeClass(info.psych.grade.id) : '');
    els.triggerMini.innerHTML = info.ok ? triggerMini(info.psych) : '';
    els.copyTip.innerHTML = copyTip(info, '제목과 본문을 진단하려면 슬라이드를 고르세요.');
    return info;
  }

  function renderScriptCopy() {
    if (!els.scriptScore) return;
    const beats = (state.scriptOut && state.scriptOut.beats) || [];
    const text = beats.length ? beats.map(b => b.narration).join('\n') : '';
    const info = C.analyzeCopy(text);
    els.scriptScore.textContent = info.ok ? info.psych.total : '—';
    els.scriptGrade.textContent = info.ok ? info.psych.grade.label : '—';
    els.scriptGrade.className = 'grade-chip ' + (info.ok ? gradeClass(info.psych.grade.id) : '');
    els.scriptTriggers.innerHTML = info.ok ? triggerMini(info.psych) : '';
    els.scriptTip.innerHTML = copyTip(info);
    if (els.scriptFriction) {
      const f = info.ok ? info.friction : null;
      els.scriptFriction.hidden = !f || !f.count;
      if (f && f.count) {
        els.scriptFriction.textContent = `${f.grade.label} ${f.score}`;
        els.scriptFriction.className = 'friction-chip ' + (f.score >= 30 ? 'bad' : '');
      }
    }
    return info;
  }

  /* ── render: slide list ─────────────────────────────────── */
  function renderList() {
    const p = state.project;
    const list = els.slideList;
    list.innerHTML = '';
    p.slides.forEach((slide, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'slide-item' + (i === state.selected ? ' is-active' : '');
      item.dataset.index = String(i);
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', `${i + 1}번 슬라이드 ${C.KIND_LABEL[slide.kind]}`);
      const kindLabel = slide.kind === 'body'
        ? `본문 ${p.slides.slice(0, i + 1).filter(s => s.kind === 'body').length}`
        : C.KIND_LABEL[slide.kind];
      item.innerHTML = `<canvas class="slide-thumb" width="52" height="66" aria-hidden="true"></canvas>
        <span class="slide-meta"><b>${esc(kindLabel)}</b><span>${esc(C.stripEmphasis(slide.title) || '(제목 없음)')}</span><em>${i + 1} / ${p.slides.length}</em></span>`;
      list.appendChild(item);
      const thumb = item.querySelector('canvas');
      drawSlide(thumb, p, i, { scale: 0.115 });
    });
    els.slideCount.textContent = p.slides.length + '장';
  }

  /* ── render: inspector values ───────────────────────────── */
  function syncInspector(force) {
    const p = state.project;
    const slide = p.slides[state.selected];
    if (!slide) return;
    const set = (el, value) => {
      if (!el) return;
      if (!force && document.activeElement === el) return;
      el.value = value;
    };
    set(els.badgeInput, p.badge || '');
    set(els.handleInput, p.handle || '');
    if (!force) {
      els.showBadge.checked = !!p.showBadge;
      els.showHandle.checked = !!p.showHandle;
      els.showPage.checked = !!p.showPage;
    }
    els.kindSelect.value = slide.kind;
    set(els.slideBadge, slide.badge || '');
    set(els.titleInput, slide.title || '');
    set(els.bodyInput, slide.body || '');
    els.editorTitle.textContent = `${state.selected + 1}번 · ${slide.kind === 'body'
      ? '본문 ' + p.slides.slice(0, state.selected + 1).filter(s => s.kind === 'body').length
      : C.KIND_LABEL[slide.kind]}`;
    const unmatched = (String(slide.title || '').match(/\*\*/g) || []).length % 2 !== 0
      || (String(slide.body || '').match(/\*\*/g) || []).length % 2 !== 0;
    els.emWarn.hidden = !unmatched;
    renderCopyMini();
  }

  /* ── render: script ─────────────────────────────────────── */
  function renderScript() {
    const s = state.script;
    const script = C.buildScript({
      topic: s.topic, target: s.target, points: s.points, hook: s.hook,
      framework: s.framework, beats: s.beats,
    });
    state.scriptOut = script;
    els.beatList.innerHTML = '';
    script.beats.forEach(beat => {
      const card = document.createElement('article');
      card.className = 'beat';
      card.dataset.beat = beat.id;
      const pct = Math.min(100, Math.round((beat.chars / Math.max(1, beat.budget)) * 100));
      card.innerHTML = `
        <div class="beat-time"><b>${beat.start}~${beat.end}초</b><span>${esc(beat.label)}</span><em>${esc(beat.hint)}</em></div>
        <div class="beat-body">
          <p class="beat-narration">${esc(beat.narration)}</p>
          <div class="screen-chips">${beat.screen.map(t => `<span>${esc(t)}</span>`).join('')}</div>
          <div class="budget">
            <div class="budget-track"><div class="budget-fill${beat.over ? ' over' : ''}" style="width:${pct}%"></div></div>
            <small class="${beat.over ? 'over' : ''}">${beat.chars}/${beat.budget}자 · ${beat.end - beat.start}초</small>
          </div>
        </div>`;
      els.beatList.appendChild(card);
    });
    const srt = C.toSrt(script.subtitles);
    state.srt = srt;
    els.srtPreview.textContent = srt;
    els.subCount.textContent = `${script.subtitles.length}줄 · 한 줄 15자`;
    renderScriptCopy();
    $$('#hookGrid .hook-btn').forEach(b => {
      const on = b.dataset.hook === s.hook;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  /* ── render: shelf ──────────────────────────────────────── */
  function renderShelf() {
    const presets = readJSON(STORE.presets, []);
    els.presetMeta.textContent = presets.length + '개';
    els.shelfCount.textContent = presets.length;
    els.shelfCount.hidden = presets.length === 0;
    els.presetList.innerHTML = '';
    els.shelfEmpty.hidden = presets.length > 0;
    presets.forEach(preset => {
      const date = preset.savedAt ? new Date(preset.savedAt) : null;
      const when = date && !isNaN(date.getTime())
        ? date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      const pj = preset.project || {};
      const meta = `${C.ratioById(pj.ratio).short} · ${C.themeById(pj.theme).name} · ${(pj.slides || []).length}장${preset.script && preset.script.topic ? ' · ' + preset.script.topic : ''}`;
      const item = document.createElement('div');
      item.className = 'preset-item';
      item.dataset.presetId = preset.id;
      item.innerHTML = `<span class="preset-main"><b>${esc(preset.name || '이름 없는 작업')}</b><span>${esc(meta)}${when ? ' · ' + esc(when) : ''}</span></span>
        <button type="button" class="btn btn-ghost" data-action="load-preset">불러오기</button>
        <button type="button" class="mini-btn danger" data-action="delete-preset" aria-label="삭제">✕</button>`;
      els.presetList.appendChild(item);
    });

    const p = state.project;
    const sc = state.script;
    els.currentMeta.textContent = `${C.ratioById(p.ratio).short} · ${p.slides.length}장`;
    els.currentList.innerHTML = [
      ['디자인', `${C.themeById(p.theme).name} · ${C.ratioById(p.ratio).label}`],
      ['슬라이드', p.slides.map(s => C.KIND_LABEL[s.kind]).join(' → ')],
      ['핸들', p.handle || '(없음)'],
      ['대본 주제', sc.topic || '(없음)'],
      ['훅 패턴', (C.HOOK_TYPES.find(h => h.id === sc.hook) || C.HOOK_TYPES[0]).label],
      ['자막', `${(state.scriptOut ? state.scriptOut.subtitles.length : 0)}줄`],
    ].map(([k, v]) => `<li><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join('');
  }

  /* ── render: all ────────────────────────────────────────── */
  function renderAll(force) {
    renderStage();
    renderList();
    syncInspector(force);
    renderScript();
    renderRefs();
    renderPalette();
    renderShelf();
  }

  function touch(structural) {
    if (structural) {
      renderStage();
      renderList();
      syncInspector();
      renderShelf();
    } else {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        renderStage();
        renderList();
        renderShelf();
        syncInspector();
      }, 90);
    }
    autosave();
  }

  function autosave() {
    els.saveState.textContent = '저장 중…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writeJSON(STORE.draft, {
        project: state.project,
        script: state.script,
        selected: state.selected,
        savedAt: Date.now(),
      });
      els.saveState.textContent = '자동 저장됨';
    }, 400);
  }

  /* ── tabs ───────────────────────────────────────────────── */
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('#view-cards').hidden = tab !== 'cards';
    $('#view-designv2').hidden = tab !== 'designv2';
    $('#view-script').hidden = tab !== 'script';
    $('#view-bridge').hidden = tab !== 'bridge';
    $('#view-shelf').hidden = tab !== 'shelf';
    if (els.topPrimary) {
      els.topPrimary.hidden = tab === 'shelf' || tab === 'bridge' || tab === 'designv2';
      els.topPrimary.dataset.action = tab === 'script' ? 'download-srt' : 'download-current';
      els.topPrimaryLabel.textContent = tab === 'script' ? '.srt 저장' : 'PNG 저장';
    }
    if (tab === 'designv2') renderV2();
    if (tab === 'script') renderScript();
    if (tab === 'shelf') renderShelf();
    if (tab === 'bridge') renderBridge();
    if (tab === 'cards') { renderStage(); renderList(); }
  }

  /* ── project mutations ──────────────────────────────────── */
  function selectSlide(i) {
    state.selected = C.clamp(i, 0, state.project.slides.length - 1);
    renderStage();
    renderList();
    syncInspector(true);
    autosave();
  }

  function addSlide(kind) {
    const p = state.project;
    if (p.slides.length >= C.MAX_SLIDES) {
      toast(`슬라이드는 최대 ${C.MAX_SLIDES}장까지입니다.`, 'warn');
      return;
    }
    if (kind === 'cta' && p.slides.some(s => s.kind === 'cta')) {
      toast('마무리 슬라이드는 한 장만 둘 수 있습니다.', 'warn');
      return;
    }
    if (kind === 'body' && C.bodyCount(p.slides) >= C.MAX_BODY_SLIDES) {
      toast(`본문은 최대 ${C.MAX_BODY_SLIDES}장까지입니다.`, 'warn');
      return;
    }
    let at = p.slides.length;
    if (kind === 'body') {
      const ctaIdx = p.slides.findIndex(s => s.kind === 'cta');
      const current = p.slides[state.selected];
      if (current && current.kind === 'body') at = state.selected + 1;
      else if (ctaIdx >= 0) at = ctaIdx;
    }
    const slide = C.makeSlide(kind);
    p.slides.splice(at, 0, slide);
    state.selected = at;
    touch(true);
    toast(`${C.KIND_LABEL[kind]} 슬라이드를 추가했습니다.`, 'ok');
  }

  function deleteSlide() {
    const p = state.project;
    if (p.slides.length <= 1) {
      toast('슬라이드는 최소 1장이 필요합니다.', 'warn');
      return;
    }
    const [removed] = p.slides.splice(state.selected, 1);
    state.selected = C.clamp(state.selected, 0, p.slides.length - 1);
    touch(true);
    toast(`${C.KIND_LABEL[removed.kind]} 슬라이드를 삭제했습니다.`, 'ok');
  }

  function duplicateSlide() {
    const p = state.project;
    if (p.slides.length >= C.MAX_SLIDES) {
      toast(`슬라이드는 최대 ${C.MAX_SLIDES}장까지입니다.`, 'warn');
      return;
    }
    const src = p.slides[state.selected];
    if (!src) return;
    const copy = C.clone(src);
    copy.id = 's' + Math.random().toString(36).slice(2, 8);
    if (copy.kind === 'cover') copy.kind = 'body';
    if (copy.kind === 'cta' || (copy.kind === 'body' && C.bodyCount(p.slides) >= MAXB())) {
      copy.kind = 'body';
    }
    p.slides.splice(state.selected + 1, 0, copy);
    state.selected += 1;
    p.slides = C.normalizeOrder(p.slides);
    state.selected = p.slides.indexOf(copy);
    touch(true);
    toast('슬라이드를 복제했습니다.', 'ok');
  }
  function MAXB() { return C.MAX_BODY_SLIDES; }

  function moveSlide(dir) {
    const p = state.project;
    const i = state.selected;
    const j = i + dir;
    if (j < 0 || j >= p.slides.length) return;
    const tmp = p.slides[i];
    p.slides[i] = p.slides[j];
    p.slides[j] = tmp;
    state.selected = j;
    touch(true);
  }

  function wrapEmphasis() {
    const el = document.activeElement === els.bodyInput ? els.bodyInput : els.titleInput;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    if (start === end) {
      toast('강조할 글자를 먼저 선택하세요.', 'warn');
      return;
    }
    const chunk = value.slice(start, end);
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      el.value = value.slice(0, start) + chunk.slice(2, -2) + value.slice(end);
    } else {
      el.value = value.slice(0, start) + '**' + chunk + '**' + value.slice(end);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }

  /* ── export ─────────────────────────────────────────────── */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function slideBlob(index) {
    const canvas = document.createElement('canvas');
    drawSlide(canvas, state.project, index, { scale: 1 });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  async function downloadCurrent() {
    await document.fonts.ready;
    const blob = await slideBlob(state.selected);
    if (!blob) { toast('PNG를 만들지 못했습니다.', 'warn'); return; }
    download(blob, `cardnews-${state.project.ratio}-${pad2(state.selected + 1)}.png`);
    toast(`${state.selected + 1}번 슬라이드 PNG를 저장했습니다.`, 'ok');
  }

  async function downloadAllZip() {
    await document.fonts.ready;
    const slides = state.project.slides;
    const files = [];
    for (let i = 0; i < slides.length; i++) {
      const blob = await slideBlob(i);
      files.push({ name: `cardnews-${pad2(i + 1)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const zip = C.buildZip(files);
    download(new Blob([zip], { type: 'application/zip' }), `cardnews-${state.project.ratio}-${slides.length}.zip`);
    toast(`${slides.length}장을 ZIP 하나로 저장했습니다.`, 'ok');
  }

  async function downloadEach() {
    await document.fonts.ready;
    const slides = state.project.slides;
    for (let i = 0; i < slides.length; i++) {
      const blob = await slideBlob(i);
      download(blob, `cardnews-${state.project.ratio}-${pad2(i + 1)}.png`);
      await new Promise(r => setTimeout(r, 320));
    }
    toast(`${slides.length}장을 개별 PNG로 저장했습니다.`, 'ok');
  }

  /* ══════════════════════════════════════════════════════════
     디자인 스튜디오 v2 — 검색 · 사진 해부 · 폰트 믹스 · 질감 · 브랜드 키트
     ══════════════════════════════════════════════════════════ */
  function v2State() {
    if (!state.v2 || typeof state.v2 !== 'object') {
      state.v2 = { fontMix: C.DEFAULT_FONT_MIX, grain: C.DEFAULT_GRAIN, source: { kind: 'preset' }, cards: null };
    }
    if (!state.v2.source) state.v2.source = { kind: 'preset' };
    return state.v2;
  }

  function v2MixName(id) {
    const m = C.designV2Info().mixes.find(x => x.id === id);
    return m ? m.name : id;
  }
  function v2GrainName(id) {
    const g = C.designV2Info().grains.find(x => x.id === id);
    return g ? g.name : id;
  }

  function saveV2Prefs() {
    const v = v2State();
    writeJSON(STORE.v2, { fontMix: v.fontMix, grain: v.grain });
  }

  function ensureV2Controls() {
    const info = C.designV2Info();
    const v = v2State();
    const fm = els.v2FontMix;
    if (fm && fm.options.length !== info.mixes.length) {
      fm.innerHTML = info.mixes.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    }
    const gr = els.v2Grain;
    if (gr && gr.options.length !== info.grains.length) {
      gr.innerHTML = info.grains.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
    }
    if (fm) fm.value = v.fontMix;
    if (gr) gr.value = v.grain;
    if (els.v2MixNote) {
      const m = info.mixes.find(x => x.id === v.fontMix);
      const g = info.grains.find(x => x.id === v.grain);
      els.v2MixNote.textContent = (m ? m.note : '') + (g && g.amount > 0 ? ' · ' + g.name + '는 인쇄 질감입니다.' : '');
    }
  }

  function renderV2Ctx() {
    if (!els.v2Ctx) return;
    const rec = C.recommendStyles(state.project, state.script);
    if (!rec.ok) {
      els.v2Ctx.textContent = '디자인 엔진을 불러오지 못했습니다.';
      return;
    }
    els.v2CtxTag.textContent = rec.context.purposeLabel;
    const slides = state.project.slides.length;
    els.v2Ctx.innerHTML = `업종 <b>${esc(rec.context.industry)}</b> · 무드 <b>${esc(rec.context.mood)}</b> · ` +
      `${slides}장 · 밀도 ${esc(rec.context.density.level)}<br>${esc(rec.context.density.note)}`;
  }

  function renderV2RefLinks() {
    if (!els.v2RefLinks) return;
    const r = C.referenceSearches(state.project, state.script);
    if (!r.ok) { els.v2RefLinks.innerHTML = '<p class="hint">디자인 엔진 v2를 불러오지 못했습니다.</p>'; return; }
    els.v2RefLinks.innerHTML = r.links.slice(0, 6).map(l => `
      <button type="button" class="ref-link" data-action="v2-open-search" data-url="${esc(l.url)}"
        title="${esc(l.label)}">
        <span class="rl-site">${esc(l.siteLabel)}</span>
        <span class="rl-q">${esc(l.q)}</span>
        <span class="rl-go" aria-hidden="true">↗</span>
      </button>`).join('');
    if (els.v2RefNote) {
      els.v2RefNote.textContent = `${r.context.industry} · ${r.context.purposeLabel} · ${r.context.mood} — 누르면 새 창에서 검색합니다.`;
    }
  }

  function renderV2Density() {
    const box = els.v2Density;
    if (!box) return;
    const d = C.cardSetDensity(state.project);
    if (!d) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'density-box ' + (d.ok ? 'ok' : 'over');
    const items = d.items.filter(it => it.over);
    box.innerHTML = `<b>${d.cards}장 중 ${d.overCards}장이 ${d.limit}자 초과</b><br>${esc(d.message)}` +
      (items.length ? `<ul>${items.map(it => `<li class="over">${it.index + 1}번 카드 · ${it.counts.total}자 — ${esc(it.suggestions[0] || '')}</li>`).join('')}</ul>` : '');
  }

  function v2Width() {
    const w = window.innerWidth || 1200;
    if (w <= 620) return 268;
    if (w <= 1080) return 300;
    return 300;
  }

  function renderV2Set() {
    const grid = els.v2Grid;
    if (!grid) return;
    const v = v2State();
    const res = C.v2Cards(v.source || { kind: 'preset' }, state.project, {
      fontMix: v.fontMix,
      grain: v.grain,
      width: v2Width(),
    });
    v.cards = res && res.ok ? res : null;
    if (!res || !res.ok) {
      grid.innerHTML = `<p class="v2-empty">${esc((res && res.error) || '카드를 그리지 못했습니다.')}</p>`;
      return;
    }
    grid.innerHTML = res.cards.map(c => `<div class="v2-slot" data-index="${c.index}">${c.html}</div>`).join('');
    if (els.v2SetName) {
      const kindLabel = res.kind === 'blueprint' ? '사진 복제' : (res.kind === 'kit' ? '브랜드 고정' : '프리셋 + 믹스');
      els.v2SetName.textContent = `${res.name} · ${kindLabel} · ${res.cards.length}장`;
    }
    const meta = [];
    meta.push(`<span>${esc(v2MixName(res.fontMix))}</span>`);
    meta.push(`<span>${esc(v2GrainName(res.grain))}</span>`);
    if (res.cards[0] && res.cards[0].meta && res.cards[0].meta.titleSize) {
      meta.push(`<span>제목 ${res.cards[0].meta.titleSize}px</span>`);
    }
    if (res.density) meta.push(`<span>${res.density.overCards}/${res.density.cards}장 밀도 초과</span>`);
    if (els.v2Meta) els.v2Meta.innerHTML = meta.join('');
    if (els.v2Warnings) {
      els.v2Warnings.innerHTML = (res.warnings || []).slice(0, 4)
        .map(w => `<span class="bad">${esc(w)}</span>`).join('');
    }
  }

  function renderV2KitList() {
    const box = els.v2KitList;
    if (!box) return;
    const kits = readJSON(STORE.brandKits, []);
    const list = Array.isArray(kits) ? kits.filter(k => k && k.schema === 'designref.brandkit/2').slice(0, 12) : [];
    if (!list.length) {
      box.innerHTML = '<p class="hint">아직 고정한 브랜드가 없습니다. 마음에 드는 세트에서 이름을 넣고 <b>현재 세트 고정</b>을 누르세요.</p>';
      return;
    }
    const v = v2State();
    const onId = v.source && v.source.kind === 'kit' && v.source.kit ? v.source.kit.id : '';
    box.innerHTML = list.map(k => `
      <div class="kit-item${k.id === onId ? ' is-on' : ''}">
        <span class="ki-main"><b>${esc(k.name)}</b><em>${esc(k.base && k.base.kind === 'blueprint' ? '사진 복제' : (k.base && k.base.presetId) || '프리셋')} · ${esc(v2MixName(k.type && k.type.fontMix))} · ${esc(v2GrainName(k.grain && k.grain.id))}</em></span>
        <button type="button" data-action="v2-apply-kit" data-id="${esc(k.id)}">적용</button>
        <button type="button" class="danger" data-action="v2-delete-kit" data-id="${esc(k.id)}" aria-label="${esc(k.name)} 삭제">✕</button>
      </div>`).join('');
  }

  function renderV2() {
    if (!C.designV2Ready()) return;
    ensureV2Controls();
    renderV2Ctx();
    renderV2RefLinks();
    renderV2Density();
    renderV2Set();
    renderV2KitList();
  }

  function v2CurrentKit() {
    const v = v2State();
    return (v.cards && v.cards.kit) || (v.source && v.source.kind === 'kit' ? v.source.kit : null);
  }

  function saveV2Kit() {
    const kit = v2CurrentKit();
    if (!kit) { toast('먼저 카드 세트를 그려 주세요.', 'warn'); return; }
    const nameInput = els.v2KitName;
    const name = String((nameInput && nameInput.value) || '').trim()
      || (state.project.slides[0] ? C.stripEmphasis(state.project.slides[0].title).slice(0, 16) : '내 브랜드');
    let named;
    try { named = C.engines.DesignRef.serializeBrandKit(kit, { name }); }
    catch (e) { named = Object.assign({}, kit, { name }); }
    const list = (readJSON(STORE.brandKits, []) || []).filter(k => k && k.id !== named.id && k.name !== named.name);
    list.unshift(named);
    writeJSON(STORE.brandKits, list.slice(0, 12));
    renderV2KitList();
    toast(`브랜드 키트 “${name}”를 고정했습니다.`, 'ok');
  }

  function applyV2Kit(id) {
    const list = readJSON(STORE.brandKits, []) || [];
    const kit = list.find(k => k && k.id === id);
    if (!kit) return;
    const v = v2State();
    v.source = { kind: 'kit', kit };
    v.fontMix = (kit.type && kit.type.fontMix) || v.fontMix;
    v.grain = (kit.grain && kit.grain.id) || 'none';
    ensureV2Controls();
    renderV2Set();
    renderV2KitList();
    toast(`“${kit.name}” 키트를 적용했습니다 · 폰트·질감·구도 고정`, 'ok');
  }

  function copyVisionPrompt() {
    const vp = C.visionPrompt(state.project, state.script, { index: state.selected });
    if (!vp.ok) { toast('디자인 엔진 v2를 불러오지 못했습니다.', 'warn'); return null; }
    copyText(vp.prompt, '레퍼런스 해부 프롬프트');
    if (els.v2BpState) els.v2BpState.textContent = `${vp.chars.toLocaleString('ko-KR')}자 · 사진과 함께 붙여넣기`;
    return vp;
  }

  function openVisionAI(targetId) {
    const vp = copyVisionPrompt();
    const map = {
      chatgpt: 'https://chatgpt.com/',
      claude: 'https://claude.ai/new',
      gemini: 'https://gemini.google.com/app',
    };
    const url = vp && targetId === 'chatgpt' ? 'https://chatgpt.com/?q=' + encodeURIComponent(vp.prompt) : (map[targetId] || map.chatgpt);
    window.open(url, '_blank', 'noopener');
  }

  function renderV2Blueprint(silent) {
    const ta = els.v2BlueprintText;
    if (!ta) return;
    const v = v2State();
    const content = C.slideContent(state.project.slides[state.selected], state.project, state.selected);
    const res = C.applyBlueprint(ta.value, content, { width: v2Width() });
    if (!res.ok) {
      if (els.v2BpWarnings) els.v2BpWarnings.innerHTML = `<span class="bad">${esc(res.error)}</span>`;
      if (els.v2BpState) els.v2BpState.textContent = '읽지 못함';
      if (!silent) toast(res.error, 'warn');
      return;
    }
    v.source = { kind: 'blueprint', blueprint: res.blueprint, name: res.name };
    if (els.v2BpState) els.v2BpState.textContent = '설계도 적용 · ' + res.name;
    if (els.v2BpMeta) {
      const m = res.meta || {};
      const chips = [];
      if (m.blueprintId) chips.push(`<span>${esc(m.blueprintId)}</span>`);
      if (m.titleSize) chips.push(`<span>제목 ${m.titleSize}px · ${m.titleLines || 1}줄</span>`);
      if (m.contrast && m.contrast.title) chips.push(`<span class="${m.contrast.title >= 4.5 ? 'ok' : 'warn'}">제목 대비 ${m.contrast.title}:1</span>`);
      if (m.overflow) chips.push('<span class="warn">카드 밖으로 나가는 요소 있음</span>');
      els.v2BpMeta.innerHTML = chips.join('');
    }
    if (els.v2BpWarnings) {
      const list = (res.fixes || []).slice(0, 3).map(f => '보정: ' + (typeof f === 'string' ? f : (f.note || f.field || '기본값')))
        .concat(res.warnings || []);
      els.v2BpWarnings.innerHTML = list.map(w => `<span class="warn-inline">${esc(String(w).slice(0, 150))}</span>`).join('');
    }
    renderV2Set();
    renderV2KitList();
    if (!silent) toast('사진에서 잰 구도로 카드 세트를 다시 그렸습니다.', 'ok');
  }

  function exportV2Png() {
    const v = v2State();
    if (!v.cards || !v.cards.cards.length) { toast('먼저 카드 세트를 그려 주세요.', 'warn'); return; }
    const card = v.cards.cards.find(c => c.index === state.selected) || v.cards.cards[0];
    if (!card.canvas || !card.canvas.commands) { toast('이 카드에는 PNG 명령이 없습니다.', 'warn'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = card.canvas.width || 1080;
    canvas.height = card.canvas.height || 1350;
    const ctx = canvas.getContext('2d');
    try {
      C.drawCardCommands(ctx, {
        commands: card.canvas.commands,
        images: {},
        placeholderColor: '#E6E8EE',
        placeholderInk: '#8A90A0',
      });
    } catch (e) {
      toast('카드를 그리지 못했습니다.', 'warn');
      return;
    }
    canvas.toBlob(blob => {
      if (blob) download(blob, `v2-card-${String(card.index + 1).padStart(2, '0')}.png`);
      toast('현재 카드를 PNG로 저장했습니다.', 'ok');
    }, 'image/png');
  }

  /* ── clipboard ──────────────────────────────────────────── */
  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} 복사했습니다.`, 'ok');
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? `${label} 복사했습니다.` : '복사하지 못했습니다.', ok ? 'ok' : 'warn');
      return ok;
    }
  }

  /* ── auto split ─────────────────────────────────────────── */
  function autoSplit() {
    const text = els.splitInput.value;
    const res = C.splitTextIntoSlides(text, {
      bodyTarget: parseInt(els.splitCount.value, 10) || 4,
      badge: state.project.badge || 'CARD NEWS',
    });
    if (res.empty) {
      toast('나눌 문장이 없습니다. 글을 먼저 붙여넣어 주세요.', 'warn');
      els.splitInput.focus();
      return;
    }
    const stamp = Date.now().toString(36);
    const slides = [res.cover].concat(res.bodies, res.cta ? [res.cta] : []);
    state.project.slides = slides.map((s, i) => ({
      id: 's' + stamp + i,
      kind: s.kind,
      badge: s.badge || '',
      title: s.title || '',
      body: s.body || '',
    }));
    state.selected = 0;
    touch(true);
    toast(`표지 + 본문 ${res.bodies.length}장 + 마무리로 나눴습니다.`, 'ok');
  }

  /* ── AI 추천 레이아웃 ──────────────────────────────────── */
  function recommendDesign(silent) {
    const rec = C.recommendStyles(state.project, state.script);
    state.recs = rec;
    renderRefs();
    if (!rec.ok && !silent) toast('디자인 엔진을 불러오지 못했습니다. engines/ 폴더를 확인하세요.', 'warn');
    return rec;
  }

  function applyDesignRef(id) {
    const preset = C.stylePreset(id);
    if (!preset) { toast('알 수 없는 스타일입니다.', 'warn'); return; }
    const rec = state.recs && state.recs.refs ? state.recs.refs.find(r => r.id === id) : null;
    const prev = state.project.design || {};
    state.project.design = {
      presetId: preset.id,
      image: prev.image || '',
      note: rec ? `적합 ${rec.percent}% · ${rec.familyLabel}` : '직접 적용',
    };
    renderStage();
    renderList();
    renderRefs();
    autosave();
    const warn = preset.id === 'neo-brutalism' ? ' B2B·금융에는 신뢰도가 떨어집니다.' : '';
    toast(`'${preset.name}' 레이아웃을 적용했습니다.${warn}`, 'ok');
  }

  function clearDesign() {
    const prev = state.project.design || {};
    state.project.design = { presetId: null, image: prev.image || '' };
    renderStage();
    renderList();
    renderRefs();
    autosave();
    toast('기본 테마로 돌아갔습니다.', 'ok');
  }

  /* ── 실사 사진 · 레퍼런스 팔레트 ────────────────────────── */
  function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const cx = canvas.getContext('2d');
          cx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.82));
        };
        img.onerror = () => reject(new Error('decode'));
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function usePhoto(file) {
    try {
      const dataUrl = await compressImage(file, 1280, 0.8);
      const prev = state.project.design || {};
      state.project.design = { presetId: prev.presetId || null, image: dataUrl, note: prev.note };
      if (!prev.presetId) {
        const rec = recommendDesign(true);
        if (rec.ok && rec.refs[0]) {
          applyDesignRef(rec.refs[0].id);
          toast(`사진에 맞춰 '${rec.refs[0].name}' 스타일을 적용했습니다. 다른 안은 목록에서 고르세요.`, 'ok');
          return;
        }
      }
      renderStage();
      renderList();
      renderRefs();
      autosave();
      toast('사진을 카드에 배치했습니다.', 'ok');
    } catch (e) {
      toast('사진을 읽지 못했습니다. JPG·PNG로 다시 시도하세요.', 'warn');
    }
  }

  function paletteFromFile(file) {
    return new Promise((resolve, reject) => {
      const DR = C.engines.DesignRef;
      if (!DR) { reject(new Error('no-engine')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 420;
          const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const cx = canvas.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0, w, h);
          const data = cx.getImageData(0, 0, w, h);
          resolve(DR.paletteFromImageData(data));
        };
        img.onerror = () => reject(new Error('decode'));
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function useReferenceImage(file) {
    try {
      const res = await paletteFromFile(file);
      if (!res || !res.ok) { toast('팔레트를 뽑지 못했습니다. 다른 이미지로 시도하세요.', 'warn'); return; }
      state.ref = res;
      applyPalette(true);
      const risk = res.isDefaultLook && res.isDefaultLook.flagged ? ' · ' + res.isDefaultLook.label : '';
      toast(`색 ${res.raw.length}개 추출 · ${res.allPass ? '대비 통과' : '대비 자동 보정'}${risk}`, 'ok');
    } catch (e) {
      toast('이미지를 읽지 못했습니다.', 'warn');
    }
  }

  function applyPalette(silent) {
    const pal = state.ref && state.ref.palette;
    if (!pal) { if (!silent) toast('먼저 레퍼런스 이미지를 넣어 주세요.', 'warn'); return; }
    const theme = C.themeFromPalette(pal, '레퍼런스 색');
    if (!theme) { toast('색을 적용하지 못했습니다.', 'warn'); return; }
    state.project.customTheme = {
      name: '레퍼런스 색',
      palette: {
        bg: pal.bg, surface: pal.surface, ink: pal.ink, sub: pal.sub,
        line: pal.line, accent: pal.accent, accentInk: pal.accentInk, accentSoft: pal.accentSoft,
      },
    };
    renderStage();
    renderList();
    renderPalette();
    autosave();
    if (!silent) toast('추출한 색을 카드에 적용했습니다.', 'ok');
  }

  function clearPalette() {
    state.project.customTheme = null;
    renderStage();
    renderList();
    renderPalette();
    autosave();
    toast('추출 색을 해제했습니다.', 'ok');
  }

  /* ── 카피 진단 · 교정 ──────────────────────────────────── */
  function correctSelected() {
    const slide = state.project.slides[state.selected];
    if (!slide) return;
    const t = C.correctCopy(slide.title);
    const b = C.correctCopy(slide.body);
    const applied = t.applied.length + b.applied.length;
    const rejected = t.rejected.length + b.rejected.length;
    if (!applied) {
      toast(rejected
        ? `문장을 통째로 바꾸는 제안 ${rejected}건은 자동 적용하지 않았습니다. “프레임워크 변환”에서 대안을 보세요.`
        : '자동으로 고칠 표현을 찾지 못했습니다. 대안을 참고하세요.', 'warn');
      return;
    }
    slide.title = t.text;
    slide.body = b.text;
    renderStage();
    renderList();
    syncInspector(true);
    autosave();
    const before = (t.before || 0) + (b.before || 0);
    const after = (t.after || 0) + (b.after || 0);
    toast(`표현 ${applied}곳 교정 · 감점 ${before} → ${after}${rejected ? ` · 제안만 ${rejected}건` : ''}`, 'ok');
  }

  function correctScript() {
    const s = state.script;
    const applied = [];
    let rejected = 0;
    s.topic = C.correctCopy(s.topic).text;
    s.target = C.correctCopy(s.target).text;
    s.points = s.points.map(p => {
      const r = C.correctCopy(p);
      applied.push.apply(applied, r.applied);
      rejected += r.rejected.length;
      return r.text;
    });
    if (Array.isArray(s.beats)) {
      s.beats = s.beats.map(b => {
        const r = C.correctCopy(b.narration);
        applied.push.apply(applied, r.applied);
        rejected += r.rejected.length;
        return Object.assign({}, b, { narration: r.text });
      });
    }
    if (s.framework && Array.isArray(s.framework.sections)) {
      s.framework = Object.assign({}, s.framework, {
        sections: s.framework.sections.map(sec => {
          const r = C.correctCopy(sec.text);
          applied.push.apply(applied, r.applied);
          rejected += r.rejected.length;
          return { label: sec.label, text: r.text };
        }),
      });
    }
    applyScriptInputs();
    renderScript();
    renderShelf();
    autosave();
    if (!applied.length) {
      toast(rejected
        ? `문장을 통째로 바꾸는 제안 ${rejected}건은 자동 적용하지 않았습니다.`
        : '고칠 표현을 찾지 못했습니다.', 'warn');
      return;
    }
    toast(`대본에서 표현 ${applied.length}곳을 교정했습니다.${rejected ? ` · 제안만 ${rejected}건` : ''}`, 'ok');
  }

  /* ── 프레임워크 모달 ───────────────────────────────────── */
  function fwInputValues() {
    return {
      product: els.fwProduct.value, target: els.fwTarget.value,
      problem: els.fwProblem.value, solution: els.fwSolution.value,
      proof: els.fwProof.value, urgency: els.fwUrgency.value,
      cta: els.fwCta.value, tone: 'casual',
    };
  }

  function fillFwInputs() {
    const input = C.frameworkInput(state.project, state.script);
    els.fwProduct.value = input.product;
    els.fwTarget.value = input.target;
    els.fwProblem.value = input.problem;
    els.fwSolution.value = input.solution;
    els.fwProof.value = input.proof;
    els.fwUrgency.value = input.urgency;
    els.fwCta.value = input.cta;
  }

  function renderFwTabs() {
    const list = [['PAS', '문제·자극·해결'], ['BAB', '이전·이후·다리'], ['AIDA', '주의·흥미·욕구·행동'], ['4U', '유용·긴급·독특·구체']];
    els.fwTabs.innerHTML = list.map(([id, label]) =>
      `<button type="button" role="tab" data-action="fw-tab" data-fw="${id}" aria-selected="${state.fw.id === id}" class="${state.fw.id === id ? 'is-active' : ''}">${id}<em>${esc(label)}</em></button>`).join('');
  }

  function renderFwOut() {
    const out = state.fw.out;
    if (!els.fwOut) return;
    if (!out || !out.ok) { els.fwOut.innerHTML = ''; return; }
    els.fwOut.innerHTML = `
      <p class="fw-title">${esc(out.title)}</p>
      <div class="fw-secs">${out.sections.map(s =>
        `<div class="fw-sec"><b>${esc(s.label)}</b><span>${esc(s.text)}</span></div>`).join('')}</div>
      <p class="hint">생성 카피 자체 점수 <b>${out.psych.total}점 ${esc(out.psych.grade.id)}</b> · ${out.chars}자</p>`;
  }

  function renderCopyLab(light) {
    const info = C.analyzeCopy(currentCardText());
    els.labScore.textContent = info.ok ? info.psych.total : '—';
    els.labGrade.textContent = info.ok ? info.psych.grade.label + ' ' + info.psych.grade.title : '—';
    els.labGrade.className = 'grade-chip ' + (info.ok ? gradeClass(info.psych.grade.id) : '');
    els.labTriggers.innerHTML = info.ok ? info.psych.triggers.map(t => `
      <div class="lab-trig">
        <div class="lab-trig-head"><b>${esc(t.name)}</b><span>가중치 ${t.weight} · <em class="${t.level}">${t.score}</em></span></div>
        <div class="trig-bar"><b class="${t.level}" style="width:${t.score}%"></b></div>
        <p>${esc(t.fix)}</p>
      </div>`).join('') : '';
    els.labFriction.textContent = info.ok ? `감점 ${info.friction.score} · ${info.friction.grade.label} · ${info.friction.count}곳` : '';
    els.labIssues.innerHTML = info.ok && info.friction.issues.length
      ? info.friction.issues.map(i => `<div class="lab-issue"><b>${esc(i.typeLabel)}</b> “${esc(i.phrase)}” <span>${esc(i.reason)}</span>${i.alternative ? `<em>→ ${esc(i.alternative)}</em>` : ''}</div>`).join('')
      : '<p class="hint">감점 표현이 없습니다.</p>';
    if (!light) renderFwTabs();
    renderFwOut();
  }

  function openCopyLab() {
    if (!els.copyLab) return;
    els.copyLab.hidden = false;
    document.body.classList.add('modal-open');
    fillFwInputs();
    state.fw.out = C.buildFrameworkFrom(fwInputValues(), state.fw.id);
    renderCopyLab();
  }

  function closeCopyLab() {
    if (!els.copyLab) return;
    els.copyLab.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function generateFw() {
    state.fw.out = C.buildFrameworkFrom(fwInputValues(), state.fw.id);
    if (!state.fw.out.ok) { toast('카피 엔진을 불러오지 못했습니다.', 'warn'); return; }
    renderFwOut();
    toast(`${state.fw.id} 카피를 만들었습니다.`, 'ok');
  }

  function applyFwSlides() {
    if (!state.fw.out || !state.fw.out.ok) generateFw();
    if (!state.fw.out || !state.fw.out.ok) return;
    const slides = C.slidesFromFramework(state.fw.out, { badge: state.project.badge || 'CARD NEWS' });
    if (!slides.length) { toast('슬라이드를 만들지 못했습니다.', 'warn'); return; }
    state.project.slides = slides;
    state.selected = 0;
    renderAll(true);
    closeCopyLab();
    switchTab('cards');
    toast(`프레임워크 카피를 ${slides.length}장으로 반영했습니다.`, 'ok');
  }

  function applyFwScript() {
    if (!state.fw.out || !state.fw.out.ok) generateFw();
    if (!state.fw.out || !state.fw.out.ok) return;
    state.script.framework = {
      id: state.fw.out.id, name: state.fw.out.name, title: state.fw.out.title,
      sections: state.fw.out.sections.map(s => ({ label: s.label, text: s.text })),
    };
    state.script.beats = null;
    if (!state.script.topic) state.script.topic = state.fw.out.input.product || '';
    applyScriptInputs();
    renderScript();
    renderShelf();
    autosave();
    closeCopyLab();
    switchTab('script');
    toast('프레임워크 카피를 30초 대본에 반영했습니다.', 'ok');
  }

  function currentCardText() {
    const s = state.project.slides[state.selected];
    return s ? [s.title, s.body].filter(Boolean).join('\n') : '';
  }

  /* ── AI 브리지 ─────────────────────────────────────────── */
  function renderProviders() {
    if (!els.providerGrid) return;
    els.providerGrid.innerHTML = C.BRIDGE_PROVIDERS.map(p => `
      <button type="button" class="provider" data-action="bridge-run" data-provider="${esc(p.id)}">
        <span class="provider-mark ${esc(p.id)}" aria-hidden="true">${esc(p.name.slice(0, 1))}</span>
        <span class="provider-txt"><b>${esc(p.name)}</b><em>${esc(p.desc)}</em></span>
        <span class="provider-go">열기 ↗</span>
      </button>`).join('');
  }

  function bridgePrompt() {
    return C.buildBridgePrompt(state.project, state.script, state.bridge.kind);
  }

  function renderBridge() {
    if (!els.bridgePromptPreview) return;
    els.bridgePromptPreview.textContent = bridgePrompt();
    const kindLabel = (C.BRIDGE_KINDS.find(k => k.id === state.bridge.kind) || C.BRIDGE_KINDS[0]).label;
    els.pasteHint.textContent = kindLabel + ' · 자동 인식';
  }

  async function runBridge(providerId) {
    const provider = C.BRIDGE_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;
    const prompt = bridgePrompt();
    els.bridgePromptPreview.textContent = prompt;
    /* 사용자 제스처 안에서 먼저 새 창을 연다(await 뒤에 열면 팝업 차단될 수 있음) */
    try { window.open(provider.url, '_blank', 'noopener'); } catch (e) { /* 팝업 차단 */ }
    const copied = await copyText(prompt, '프롬프트를');
    if (!copied) {
      els.bridgeStatus.textContent = '복사가 막혔습니다. 아래 “복사될 프롬프트 보기”에서 직접 복사하세요.';
      return;
    }
    els.bridgeStatus.innerHTML = `<b>${esc(provider.name)}</b> 프롬프트를 복사했습니다. 열린 창에 붙여넣고(Ctrl+V), 답변을 오른쪽에 붙여넣으세요.`;
  }

  function renderParse() {
    const parsed = state.bridge.parsed;
    if (!els.parseStatus) return;
    if (!parsed) { els.parseStatus.innerHTML = ''; els.parsePreview.innerHTML = ''; return; }
    if (!parsed.ok) {
      els.parseStatus.innerHTML = `<span class="parse-bad">읽지 못했습니다</span> ${parsed.warnings.map(w => esc(w)).join(' ')}`;
      els.parsePreview.innerHTML = '';
      return;
    }
    const warn = parsed.warnings.length ? ` · ${parsed.warnings.map(w => esc(w)).join(' ')}` : '';
    if (parsed.kind === 'cards') {
      els.parseStatus.innerHTML = `<span class="parse-ok">슬라이드 ${parsed.slides.length}장 인식</span> (${parsed.format.toUpperCase()})${warn}`;
      els.parsePreview.innerHTML = parsed.slides.map((s, i) => `
        <div class="parse-card">
          <b>${i + 1}. ${esc(C.KIND_LABEL[s.kind] || s.kind)}${s.badge ? ' · ' + esc(s.badge) : ''}</b>
          <span>${esc(s.title)}</span>
          ${s.body ? `<em>${esc(s.body)}</em>` : ''}
        </div>`).join('');
    } else if (parsed.kind === 'script') {
      els.parseStatus.innerHTML = `<span class="parse-ok">대본 ${parsed.beats.length}구간 인식</span> (${parsed.format.toUpperCase()})${warn}`;
      els.parsePreview.innerHTML = parsed.beats.map((b, i) => `
        <div class="parse-card">
          <b>${i + 1}. ${esc(b.id || ['hook', 'problem', 'proof', 'cta'][i] || '비트')}</b>
          <span>${esc(b.narration)}</span>
          ${b.screen.length ? `<em>자막 · ${esc(b.screen.join(' / '))}</em>` : ''}
        </div>`).join('');
    } else {
      const c = parsed.critique || { problems: [], fixes: [], score: 0 };
      els.parseStatus.innerHTML = `<span class="parse-ok">개선안 인식</span> 점수 ${c.score}${warn}`;
      els.parsePreview.innerHTML = `
        <div class="parse-card"><b>문제점</b>${c.problems.map(x => `<span>· ${esc(x)}</span>`).join('')}</div>
        <div class="parse-card"><b>고칠 문장</b>${c.fixes.map(x => `<span>· ${esc(x)}</span>`).join('')}</div>`;
    }
  }

  function parseBridgeNow(silent) {
    const text = els.bridgePaste.value;
    const parsed = C.parseBridgeAnswer(text, state.bridge.kind);
    state.bridge.parsed = parsed;
    renderParse();
    if (!silent && !parsed.ok && text.trim()) toast('구조를 찾지 못했습니다. “다시 읽기”를 누르거나 프롬프트를 다시 물어보세요.', 'warn');
    return parsed;
  }

  function applyBridge() {
    const parsed = state.bridge.parsed && state.bridge.parsed.ok ? state.bridge.parsed : parseBridgeNow(true);
    if (!parsed || !parsed.ok) { toast('먼저 AI 답변을 붙여넣고 “다시 읽기”를 눌러 주세요.', 'warn'); return; }
    if (parsed.kind === 'cards') {
      const slides = C.applyBridgeSlides(state.project, parsed);
      if (!slides) { toast('슬라이드로 바꾸지 못했습니다.', 'warn'); return; }
      state.project.slides = slides;
      state.selected = 0;
      renderAll(true);
      switchTab('cards');
      toast(`AI 답변을 ${slides.length}장으로 적용했습니다.`, 'ok');
      return;
    }
    if (parsed.kind === 'script') {
      const next = C.applyBridgeScript(state.script, parsed);
      if (!next) { toast('대본으로 바꾸지 못했습니다.', 'warn'); return; }
      state.script = Object.assign({}, state.script, next, { framework: null });
      applyScriptInputs();
      renderScript();
      renderShelf();
      autosave();
      switchTab('script');
      toast('AI 답변을 30초 대본으로 적용했습니다.', 'ok');
      return;
    }
    toast('개선안은 미리보기로 확인하세요. 카드뉴스 세트를 다시 요청하면 바로 적용됩니다.', 'ok');
  }

  /* ── Gemini API 키(선택) ───────────────────────────────── */
  const GEMINI_STORE = 'cns.v1.gemini';
  const GEMINI_MODEL_STORE = 'cns.v1.geminiModel';

  function loadGemini() {
    try {
      state.gemini.key = localStorage.getItem(GEMINI_STORE) || '';
      state.gemini.model = localStorage.getItem(GEMINI_MODEL_STORE) || C.GEMINI_DEFAULT_MODEL;
    } catch (e) { /* 사생활 모드 */ }
    renderGeminiState();
  }

  function renderGeminiState() {
    if (!els.geminiState) return;
    const key = state.gemini.key;
    els.geminiState.textContent = key
      ? `저장됨 · ${key.slice(0, 4)}…${key.slice(-4)} (이 브라우저에만)`
      : '키가 저장되지 않았습니다. 복사·붙여넣기 방식만 써도 됩니다.';
    if (els.geminiKey) {
      els.geminiKey.value = '';
      els.geminiKey.placeholder = key ? '저장된 키 사용 중 (바꾸려면 새 키 입력)' : 'AIza…';
    }
    if (els.geminiModel && state.gemini.model) {
      const has = Array.from(els.geminiModel.options).some(o => o.value === state.gemini.model);
      if (!has) els.geminiModel.add(new Option(state.gemini.model, state.gemini.model));
      els.geminiModel.value = state.gemini.model;
    }
  }

  function saveGeminiKey() {
    const value = String(els.geminiKey.value || '').trim();
    if (!value) { toast('키를 입력하세요.', 'warn'); return; }
    if (value.length < 20) { toast('키가 너무 짧습니다. Google AI Studio의 키 전체를 붙여넣으세요.', 'warn'); return; }
    state.gemini.key = value;
    try { localStorage.setItem(GEMINI_STORE, value); } catch (e) { /* ignore */ }
    renderGeminiState();
    toast('키를 이 브라우저에만 저장했습니다.', 'ok');
  }

  function clearGeminiKey() {
    state.gemini.key = '';
    try { localStorage.removeItem(GEMINI_STORE); } catch (e) { /* ignore */ }
    renderGeminiState();
    if (els.geminiResult) els.geminiResult.textContent = '키를 삭제했습니다.';
    toast('Gemini 키를 삭제했습니다.', 'ok');
  }

  async function checkGeminiKey() {
    if (!state.gemini.key) { toast('먼저 키를 저장하세요.', 'warn'); return; }
    els.geminiResult.textContent = '키를 확인하는 중…';
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(state.gemini.key)}`);
      let json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      if (!res.ok) { els.geminiResult.textContent = C.geminiErrorText(res.status, json); return; }
      const models = ((json && json.models) || [])
        .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
        .map(m => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
      if (els.geminiModel && models.length) {
        const preferred = models.filter(m => /flash/.test(m)).sort();
        const rest = models.filter(m => !/flash/.test(m)).sort();
        els.geminiModel.innerHTML = preferred.concat(rest).slice(0, 12)
          .map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        if (state.gemini.model) {
          const has = Array.from(els.geminiModel.options).some(o => o.value === state.gemini.model);
          if (has) els.geminiModel.value = state.gemini.model;
        }
        state.gemini.model = els.geminiModel.value;
      }
      els.geminiResult.textContent = `연결됨 · 사용 가능한 모델 ${models.length}개${els.geminiModel ? ' · ' + els.geminiModel.value : ''}`;
      toast('키가 살아 있습니다. “Gemini로 생성”을 눌러 보세요.', 'ok');
    } catch (e) {
      els.geminiResult.textContent = e && e.name === 'AbortError'
        ? '응답이 없습니다(45초). 네트워크를 확인하세요.'
        : '네트워크 오류로 확인하지 못했습니다.';
    }
  }

  async function generateWithGemini() {
    if (!state.gemini.key) { toast('Gemini 키를 먼저 저장하세요. 복사·붙여넣기만 쓸 거면 필요 없습니다.', 'warn'); return; }
    state.gemini.model = (els.geminiModel && els.geminiModel.value) || state.gemini.model || C.GEMINI_DEFAULT_MODEL;
    try { localStorage.setItem(GEMINI_MODEL_STORE, state.gemini.model); } catch (e) { /* ignore */ }
    const prompt = bridgePrompt();
    els.bridgePromptPreview.textContent = prompt;
    els.geminiResult.textContent = 'Gemini가 쓰는 중…';
    const url = C.geminiEndpoint(state.gemini.model) + '?key=' + encodeURIComponent(state.gemini.key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        }),
        signal: controller.signal,
      });
      let json = null;
      try { json = await res.json(); } catch (e) { json = null; }
      if (!res.ok) { els.geminiResult.textContent = C.geminiErrorText(res.status, json); return; }
      const text = C.parseGeminiResponse(json);
      if (!text) { els.geminiResult.textContent = '답변이 비어 있습니다(안전 필터일 수 있음). 다시 시도하세요.'; return; }
      els.bridgePaste.value = text;
      els.geminiResult.textContent = '생성 완료 · 오른쪽 미리보기를 확인하고 “적용”을 누르세요.';
      parseBridgeNow(true);
    } catch (e) {
      els.geminiResult.textContent = e && e.name === 'AbortError'
        ? '응답이 없습니다(45초).'
        : '네트워크 오류. 키·모델·연결을 확인하세요.';
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── presets ────────────────────────────────────────────── */
  function savePreset(name) {
    const list = readJSON(STORE.presets, []);
    const projectForSave = C.clone(state.project);
    const hadPhoto = !!(projectForSave.design && projectForSave.design.image);
    if (hadPhoto) projectForSave.design.image = '';
    const preset = {
      id: 'p' + Date.now().toString(36),
      name: String(name || '').trim() || `작업 ${new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      savedAt: new Date().toISOString(),
      project: projectForSave,
      script: C.clone(state.script),
    };
    list.unshift(preset);
    writeJSON(STORE.presets, list.slice(0, 30));
    renderShelf();
    toast(hadPhoto
      ? '작업함에 저장했습니다. 사진은 용량 때문에 현재 작업에만 남습니다.'
      : '작업함에 저장했습니다.', 'ok');
  }

  function loadPreset(id) {
    const list = readJSON(STORE.presets, []);
    const preset = list.find(p => p.id === id);
    if (!preset) { toast('저장된 작업을 찾지 못했습니다.', 'warn'); return; }
    state.project = C.sanitizeProject(preset.project);
    state.script = normalizeScript(preset.script);
    state.selected = 0;
    applyScriptInputs();
    renderAll(true);
    switchTab('cards');
    renderShelf();
    autosave();
    toast(`'${preset.name}' 작업을 불러왔습니다.`, 'ok');
  }

  function deletePreset(id) {
    const list = readJSON(STORE.presets, []);
    const preset = list.find(p => p.id === id);
    if (!preset) return;
    if (!window.confirm(`'${preset.name}' 작업을 삭제할까요?`)) return;
    writeJSON(STORE.presets, list.filter(p => p.id !== id));
    renderShelf();
    toast('삭제했습니다.', 'ok');
  }

  /* ── theme ──────────────────────────────────────────────── */
  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', next === 'dark' ? '#080a0f' : '#ffffff');
    const btn = $('[data-action="toggle-theme"]');
    if (btn) btn.setAttribute('aria-label', next === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
    try { localStorage.setItem(STORE.theme, next); } catch (e) { /* ignore */ }
  }

  /* ── script inputs ──────────────────────────────────────── */
  function normalizeScript(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const src = Object.keys(s).length ? s : C.SAMPLE_SCRIPT;
    const points = Array.isArray(src.points) ? src.points.slice(0, 3) : [];
    while (points.length < 3) points.push('');
    const fw = src.framework && Array.isArray(src.framework.sections) && src.framework.sections.length
      ? {
        id: String(src.framework.id || 'PAS'),
        name: String(src.framework.name || ''),
        title: String(src.framework.title || ''),
        sections: src.framework.sections.slice(0, 6).map(s => ({ label: String(s.label || ''), text: String(s.text || '') })),
      }
      : null;
    const beats = Array.isArray(src.beats) && src.beats.length
      ? src.beats.slice(0, 4).map(b => ({
        id: String(b.id || ''),
        narration: String(b.narration || ''),
        screen: Array.isArray(b.screen) ? b.screen.slice(0, 2).map(x => String(x)) : [],
      })).filter(b => b.narration)
      : null;
    return {
      topic: String(src.topic || ''),
      target: String(src.target || ''),
      points: points.map(p => String(p || '')),
      hook: C.HOOK_TYPES.some(h => h.id === src.hook) ? src.hook : 'shock',
      framework: fw,
      beats: beats && beats.length >= 3 ? beats : null,
    };
  }

  function applyScriptInputs() {
    const s = state.script;
    els.topicInput.value = s.topic;
    els.targetInput.value = s.target;
    ['#point1', '#point2', '#point3'].forEach((sel, i) => { $(sel).value = s.points[i] || ''; });
    $$('#hookGrid .hook-btn').forEach(b => {
      const on = b.dataset.hook === s.hook;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  function readScriptInputs() {
    state.script.topic = els.topicInput.value;
    state.script.target = els.targetInput.value;
    state.script.points = [$('#point1').value, $('#point2').value, $('#point3').value];
  }

  /* ── controls ───────────────────────────────────────────── */
  function buildControls() {
    const ratioSeg = els.ratioSeg;
    ratioSeg.innerHTML = C.RATIOS.map(r =>
      `<button type="button" data-ratio="${r.id}" title="${esc(r.hint)}">${esc(r.label)}</button>`).join('');

    els.themeGrid.innerHTML = C.THEMES.map(t => `
      <button type="button" class="theme-btn" role="radio" aria-checked="false" data-theme-id="${t.id}" title="${esc(t.name)} — ${esc(t.desc)}">
        <span class="swatch" style="background:linear-gradient(135deg,${t.bg},${t.bgTo});--dot:${t.accent}"></span>
        <span class="theme-txt"><b>${esc(t.name)}</b><em>${esc(t.desc)}</em></span>
      </button>`).join('');

    els.hookGrid.innerHTML = C.HOOK_TYPES.map(h => `
      <button type="button" class="hook-btn" role="radio" aria-checked="false" data-hook="${h.id}">
        <b>${esc(h.label)}</b><span>${esc(h.desc)}</span>
      </button>`).join('');
  }

  /* ── events ─────────────────────────────────────────────── */
  function bind() {
    document.addEventListener('click', ev => {
      const tabBtn = ev.target.closest('.tab');
      if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }

      const ratioBtn = ev.target.closest('#ratioSeg button');
      if (ratioBtn) {
        state.project.ratio = ratioBtn.dataset.ratio;
        renderStage(); renderList(); autosave();
        return;
      }

      const themeBtn = ev.target.closest('#themeGrid .theme-btn');
      if (themeBtn) {
        state.project.theme = themeBtn.dataset.themeId;
        if (state.project.design && state.project.design.presetId) {
          state.project.design = { presetId: null, image: state.project.design.image || '' };
          toast('기본 테마로 돌아갔습니다.', 'ok');
        }
        renderStage(); renderList(); renderRefs(); autosave();
        return;
      }

      const hookBtn = ev.target.closest('#hookGrid .hook-btn');
      if (hookBtn) {
        state.script.hook = hookBtn.dataset.hook;
        renderScript(); renderShelf(); autosave();
        return;
      }

      const slideItem = ev.target.closest('.slide-item');
      if (slideItem) { selectSlide(parseInt(slideItem.dataset.index, 10)); return; }

      const act = ev.target.closest('[data-action]');
      if (!act) return;
      const action = act.dataset.action;
      if (action === 'toggle-theme') {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      } else if (action === 'go-cards') {
        ev.preventDefault();
        switchTab('cards');
      } else if (action === 'download-current') {
        downloadCurrent();
      } else if (action === 'download-all') {
        downloadAllZip();
      } else if (action === 'download-each') {
        downloadEach();
      } else if (action === 'add-body') {
        addSlide('body');
      } else if (action === 'add-cta') {
        addSlide('cta');
      } else if (action === 'delete-slide') {
        deleteSlide();
      } else if (action === 'duplicate-slide') {
        duplicateSlide();
      } else if (action === 'move-up') {
        moveSlide(-1);
      } else if (action === 'move-down') {
        moveSlide(1);
      } else if (action === 'wrap-em') {
        wrapEmphasis();
      } else if (action === 'auto-split') {
        autoSplit();
      } else if (action === 'recommend-design') {
        const rec = recommendDesign();
        if (rec.ok) toast(`스타일 ${rec.refs.length}안을 골랐습니다. 마음에 드는 안을 누르세요.`, 'ok');
      } else if (action === 'apply-design-ref') {
        applyDesignRef(act.dataset.refId);
      } else if (action === 'clear-design') {
        clearDesign();
      } else if (action === 'apply-palette') {
        applyPalette();
      } else if (action === 'clear-palette') {
        clearPalette();
      } else if (action === 'paste-hint') {
        toast('이미지를 복사한 뒤 이 화면에서 Ctrl+V(맥은 ⌘V)를 누르면 색을 추출합니다.', 'ok');
      } else if (action === 'correct-selected') {
        correctSelected();
        if (els.copyLab && !els.copyLab.hidden) renderCopyLab();
      } else if (action === 'correct-script') {
        correctScript();
      } else if (action === 'open-copy-lab' || action === 'framework-script') {
        openCopyLab();
      } else if (action === 'close-copy-lab') {
        closeCopyLab();
      } else if (action === 'fw-tab') {
        state.fw.id = act.dataset.fw;
        state.fw.out = C.buildFrameworkFrom(fwInputValues(), state.fw.id);
        renderFwTabs();
        renderFwOut();
      } else if (action === 'fw-generate') {
        generateFw();
      } else if (action === 'fw-apply-slides') {
        applyFwSlides();
      } else if (action === 'fw-apply-script') {
        applyFwScript();
      } else if (action === 'copy-lab-json') {
        const info = C.analyzeCopy(currentCardText());
        copyText(JSON.stringify({ total: info.psych && info.psych.total, grade: info.psych && info.psych.grade.id, triggers: info.psych && info.psych.triggers.map(t => ({ id: t.id, score: t.score })), friction: info.friction && info.friction.score }, null, 2), '진단 JSON을');
      } else if (action === 'bridge-run') {
        runBridge(act.dataset.provider);
      } else if (action === 'parse-bridge') {
        parseBridgeNow();
      } else if (action === 'apply-bridge') {
        applyBridge();
      } else if (action === 'save-gemini-key') {
        saveGeminiKey();
      } else if (action === 'clear-gemini-key') {
        clearGeminiKey();
      } else if (action === 'check-gemini-key') {
        checkGeminiKey();
      } else if (action === 'generate-gemini') {
        generateWithGemini();
      } else if (action === 'build-script') {
        readScriptInputs();
        renderScript(); renderShelf(); autosave();
        toast('대본을 다시 만들었습니다.', 'ok');
      } else if (action === 'download-srt') {
        downloadSrt();
      } else if (action === 'copy-script') {
        copyText(C.scriptToText(state.scriptOut), '대본을');
      } else if (action === 'copy-prompt') {
        copyText(C.buildAiPrompt(state.script, state.scriptOut), 'AI 각색 프롬프트를');
      } else if (action === 'copy-srt') {
        copyText(state.srt, 'SRT를');
      } else if (action === 'reset-work') {
        if (!window.confirm('현재 카드뉴스와 대본을 예시로 되돌릴까요? 저장한 작업은 그대로 남습니다.')) return;
        state.project = C.createProject();
        state.script = normalizeScript(C.SAMPLE_SCRIPT);
        state.selected = 0;
        applyScriptInputs();
        renderAll(true);
        autosave();
        toast('예시로 되돌렸습니다.', 'ok');
      } else if (action === 'v2-open-search') {
        const url = act.dataset.url || '';
        if (/^https:\/\/(www\.)?(pinterest\.com|behance\.net)\//.test(url)) {
          window.open(url, '_blank', 'noopener');
          toast('레퍼런스 검색을 새 창에서 열었습니다.', 'ok');
        } else {
          toast('검색 주소를 확인하지 못했습니다.', 'warn');
        }
      } else if (action === 'v2-save-kit') {
        saveV2Kit();
      } else if (action === 'v2-copy-kit') {
        const kit = v2CurrentKit();
        const json = kit ? C.kitToJSON(kit) : '';
        if (json) copyText(json, '브랜드 키트 JSON을'); else toast('먼저 카드 세트를 그려 주세요.', 'warn');
      } else if (action === 'v2-import-kit') {
        const parsed = C.kitFromJSON(els.v2KitJson ? els.v2KitJson.value : '');
        if (!parsed.ok) {
          toast((parsed.errors && parsed.errors[0]) || '키트 JSON을 읽지 못했습니다.', 'warn');
        } else {
          const list = (readJSON(STORE.brandKits, []) || []).filter(k => k && k.id !== parsed.kit.id);
          list.unshift(parsed.kit);
          writeJSON(STORE.brandKits, list.slice(0, 12));
          const v = v2State();
          v.source = { kind: 'kit', kit: parsed.kit };
          v.fontMix = (parsed.kit.type && parsed.kit.type.fontMix) || v.fontMix;
          v.grain = (parsed.kit.grain && parsed.kit.grain.id) || 'none';
          ensureV2Controls();
          renderV2Set();
          renderV2KitList();
          toast(`브랜드 키트 “${parsed.kit.name}”를 불러왔습니다.`, 'ok');
        }
      } else if (action === 'v2-apply-kit') {
        applyV2Kit(act.dataset.id);
      } else if (action === 'v2-delete-kit') {
        const id = act.dataset.id;
        writeJSON(STORE.brandKits, (readJSON(STORE.brandKits, []) || []).filter(k => k && k.id !== id));
        const v = v2State();
        if (v.source && v.source.kind === 'kit' && v.source.kit && v.source.kit.id === id) {
          v.source = { kind: 'preset' };
          renderV2Set();
        }
        renderV2KitList();
        toast('키트를 지웠습니다.', 'ok');
      } else if (action === 'v2-copy-vision') {
        copyVisionPrompt();
      } else if (action === 'v2-open-vision') {
        openVisionAI(act.dataset.target);
      } else if (action === 'v2-render-blueprint') {
        renderV2Blueprint(false);
      } else if (action === 'v2-sample-blueprint') {
        const DR = C.engines.DesignRef;
        if (DR && DR.BLUEPRINT_EXAMPLE && els.v2BlueprintText) {
          els.v2BlueprintText.value = JSON.stringify(DR.BLUEPRINT_EXAMPLE, null, 2);
          renderV2Blueprint(true);
          toast('예시 설계도를 채우고 이 카드 세트로 다시 그렸습니다.', 'ok');
        }
      } else if (action === 'v2-save-blueprint-kit') {
        saveV2Kit();
      } else if (action === 'v2-copy-html') {
        const v = v2State();
        if (v.cards && v.cards.cards.length) copyText(v.cards.cards.map(c => c.html).join('\n'), '카드 HTML을');
        else toast('먼저 카드 세트를 그려 주세요.', 'warn');
      } else if (action === 'v2-copy-css') {
        const v = v2State();
        if (v.cards && v.cards.cards.length) {
          const css = v.cards.cards[0].css || '';
          if (css) copyText(css, '카드 CSS를'); else toast('이 카드에는 복사할 CSS가 없습니다.', 'warn');
        } else toast('먼저 카드 세트를 그려 주세요.', 'warn');
      } else if (action === 'v2-png') {
        exportV2Png();
      } else if (action === 'v2-reset') {
        const v = v2State();
        v.source = { kind: 'preset' };
        renderV2Set();
        renderV2KitList();
        toast('선택한 프리셋 카드로 돌아왔습니다.', 'ok');
      } else if (action === 'load-preset') {
        const item = act.closest('[data-preset-id]');
        if (item) loadPreset(item.dataset.presetId);
      } else if (action === 'delete-preset') {
        const item = act.closest('[data-preset-id]');
        if (item) deletePreset(item.dataset.presetId);
      }
    });

    els.badgeInput.addEventListener('input', () => {
      state.project.badge = els.badgeInput.value;
      touch(false);
    });
    els.handleInput.addEventListener('input', () => {
      state.project.handle = els.handleInput.value;
      touch(false);
    });
    els.slideBadge.addEventListener('input', () => {
      const slide = state.project.slides[state.selected];
      if (!slide) return;
      slide.badge = els.slideBadge.value;
      touch(false);
    });
    [els.titleInput, els.bodyInput].forEach(el => {
      el.addEventListener('input', () => {
        const slide = state.project.slides[state.selected];
        if (!slide) return;
        slide[el === els.titleInput ? 'title' : 'body'] = el.value;
        syncEmWarn();
        touch(false);
      });
    });
    els.kindSelect.addEventListener('change', () => {
      const slide = state.project.slides[state.selected];
      if (!slide) return;
      const nextKind = els.kindSelect.value;
      if (nextKind === 'cover' && state.project.slides.some((s, i) => i !== state.selected && s.kind === 'cover')) {
        toast('표지는 한 장만 둘 수 있습니다.', 'warn');
        els.kindSelect.value = slide.kind;
        return;
      }
      if (nextKind === 'cta' && state.project.slides.some((s, i) => i !== state.selected && s.kind === 'cta')) {
        toast('마무리는 한 장만 둘 수 있습니다.', 'warn');
        els.kindSelect.value = slide.kind;
        return;
      }
      if (nextKind === 'body' && slide.kind !== 'body' && C.bodyCount(state.project.slides) >= MAXB()) {
        toast(`본문은 최대 ${C.MAX_BODY_SLIDES}장까지입니다.`, 'warn');
        els.kindSelect.value = slide.kind;
        return;
      }
      slide.kind = nextKind;
      state.project.slides = C.normalizeOrder(state.project.slides);
      state.selected = state.project.slides.indexOf(slide);
      touch(true);
    });
    els.showBadge.addEventListener('change', () => { state.project.showBadge = els.showBadge.checked; touch(true); });
    els.showHandle.addEventListener('change', () => { state.project.showHandle = els.showHandle.checked; touch(true); });
    els.showPage.addEventListener('change', () => { state.project.showPage = els.showPage.checked; touch(true); });
    els.splitCount.addEventListener('change', () => { state.splitCount = parseInt(els.splitCount.value, 10); });

    if (els.v2FontMix) els.v2FontMix.addEventListener('change', () => {
      v2State().fontMix = els.v2FontMix.value;
      saveV2Prefs();
      ensureV2Controls();
      renderV2Set();
    });
    if (els.v2Grain) els.v2Grain.addEventListener('change', () => {
      v2State().grain = els.v2Grain.value;
      saveV2Prefs();
      ensureV2Controls();
      renderV2Set();
    });
    if (els.v2KitName) els.v2KitName.addEventListener('input', () => {
      const key = STORE.brandKits + ':name';
      writeJSON(key, els.v2KitName.value);
    });

    if (els.photoInput) {
      els.photoInput.addEventListener('change', () => {
        const file = els.photoInput.files && els.photoInput.files[0];
        if (file) usePhoto(file);
        els.photoInput.value = '';
      });
    }
    if (els.refImageInput) {
      els.refImageInput.addEventListener('change', () => {
        const file = els.refImageInput.files && els.refImageInput.files[0];
        if (file) useReferenceImage(file);
        els.refImageInput.value = '';
      });
    }
    if (els.bridgeKind) {
      els.bridgeKind.addEventListener('change', () => {
        state.bridge.kind = els.bridgeKind.value;
        state.bridge.parsed = null;
        renderBridge();
        renderParse();
      });
    }
    if (els.bridgePaste) {
      let bridgeTimer = null;
      els.bridgePaste.addEventListener('input', () => {
        clearTimeout(bridgeTimer);
        bridgeTimer = setTimeout(() => { if (els.bridgePaste.value.trim().length > 20) parseBridgeNow(true); }, 320);
      });
    }
    if (els.geminiModel) {
      els.geminiModel.addEventListener('change', () => {
        state.gemini.model = els.geminiModel.value;
        try { localStorage.setItem(GEMINI_MODEL_STORE, state.gemini.model); } catch (e) { /* ignore */ }
      });
    }

    /* 레퍼런스 이미지 붙여넣기 (입력창에 쓰는 글은 방해하지 않음) */
    document.addEventListener('paste', ev => {
      const items = (ev.clipboardData && ev.clipboardData.items) || [];
      let file = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) { file = items[i].getAsFile(); break; }
      }
      if (!file) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (taskInput(tag)) return;
      ev.preventDefault();
      useReferenceImage(file);
    });

    function taskInput(tag) { return /INPUT|TEXTAREA|SELECT/.test(tag); }

    [els.topicInput, els.targetInput, $('#point1'), $('#point2'), $('#point3')].forEach(el => {
      el.addEventListener('input', () => {
        readScriptInputs();
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => { renderScript(); renderShelf(); }, 120);
        autosave();
      });
    });

    els.saveForm.addEventListener('submit', ev => {
      ev.preventDefault();
      savePreset(els.presetName.value);
      els.presetName.value = '';
    });

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') {
        if (els.copyLab && !els.copyLab.hidden) closeCopyLab();
        return;
      }
      if (state.tab !== 'cards') return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') { ev.preventDefault(); selectSlide(state.selected + 1); }
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') { ev.preventDefault(); selectSlide(state.selected - 1); }
    });
  }

  function syncEmWarn() {
    const slide = state.project.slides[state.selected];
    if (!slide) return;
    const unmatched = (String(slide.title || '').match(/\*\*/g) || []).length % 2 !== 0
      || (String(slide.body || '').match(/\*\*/g) || []).length % 2 !== 0;
    els.emWarn.hidden = !unmatched;
  }

  function downloadSrt() {
    if (!state.srt) { toast('먼저 대본을 만들어 주세요.', 'warn'); return; }
    const blob = new Blob([state.srt], { type: 'text/plain;charset=utf-8' });
    download(blob, 'shortform-30s.srt');
    toast(`자막 ${state.scriptOut.subtitles.length}줄을 .srt로 저장했습니다.`, 'ok');
  }

  /* ── boot ───────────────────────────────────────────────── */
  function boot() {
    els.preview = $('#preview');
    els.stageDims = $('#stageDims');
    els.stageNote = $('#stageNote');
    els.themeName = $('#themeName');
    els.ratioSeg = $('#ratioSeg');
    els.themeGrid = $('#themeGrid');
    els.slideList = $('#slideList');
    els.slideCount = $('#slideCount');
    els.badgeInput = $('#badgeInput');
    els.handleInput = $('#handleInput');
    els.slideBadge = $('#slideBadge');
    els.showBadge = $('#showBadge');
    els.showHandle = $('#showHandle');
    els.showPage = $('#showPage');
    els.kindSelect = $('#kindSelect');
    els.editorTitle = $('#editorTitle');
    els.titleInput = $('#titleInput');
    els.bodyInput = $('#bodyInput');
    els.emWarn = $('#emWarn');
    els.splitInput = $('#splitInput');
    els.splitCount = $('#splitCount');
    els.beatList = $('#beatList');
    els.srtPreview = $('#srtPreview');
    els.subCount = $('#subCount');
    els.hookGrid = $('#hookGrid');
    els.topicInput = $('#topicInput');
    els.targetInput = $('#targetInput');
    els.presetList = $('#presetList');
    els.presetMeta = $('#presetMeta');
    els.shelfEmpty = $('#shelfEmpty');
    els.shelfCount = $('#shelfCount');
    els.currentMeta = $('#currentMeta');
    els.currentList = $('#currentList');
    els.saveForm = $('#saveForm');
    els.presetName = $('#presetName');
    els.saveState = $('#saveState');
    els.topPrimary = $('#topPrimary');
    els.topPrimaryLabel = $('#topPrimaryLabel');
    els.toastRoot = $('#toastRoot');
    els.refBlock = $('#refBlock');
    els.refCtx = $('#refCtx');
    els.refList = $('#refList');
    els.refApplied = $('#refApplied');
    els.refAppliedName = $('#refAppliedName');
    els.refAppliedNote = $('#refAppliedNote');
    els.refPhotoNote = $('#refPhotoNote');
    els.photoInput = $('#photoInput');
    els.refImageInput = $('#refImageInput');
    els.paletteRow = $('#paletteRow');
    els.copyScore = $('#copyScore');
    els.copyGrade = $('#copyGrade');
    els.triggerMini = $('#triggerMini');
    els.copyTip = $('#copyTip');
    els.scriptScore = $('#scriptScore');
    els.scriptGrade = $('#scriptGrade');
    els.scriptTriggers = $('#scriptTriggers');
    els.scriptTip = $('#scriptTip');
    els.scriptFriction = $('#scriptFriction');
    els.copyLab = $('#copyLab');
    els.labScore = $('#labScore');
    els.labGrade = $('#labGrade');
    els.labTriggers = $('#labTriggers');
    els.labFriction = $('#labFriction');
    els.labIssues = $('#labIssues');
    els.fwTabs = $('#fwTabs');
    els.fwProduct = $('#fwProduct');
    els.fwTarget = $('#fwTarget');
    els.fwProblem = $('#fwProblem');
    els.fwSolution = $('#fwSolution');
    els.fwProof = $('#fwProof');
    els.fwUrgency = $('#fwUrgency');
    els.fwCta = $('#fwCta');
    els.fwOut = $('#fwOut');
    els.bridgeKind = $('#bridgeKind');
    els.providerGrid = $('#providerGrid');
    els.bridgeStatus = $('#bridgeStatus');
    els.bridgePromptPreview = $('#bridgePromptPreview');
    els.bridgePaste = $('#bridgePaste');
    els.pasteHint = $('#pasteHint');
    els.parseStatus = $('#parseStatus');
    els.parsePreview = $('#parsePreview');
    els.geminiKey = $('#geminiKey');
    els.geminiState = $('#geminiState');
    els.geminiModel = $('#geminiModel');
    els.geminiResult = $('#geminiResult');
    els.v2Ctx = $('#v2Ctx');
    els.v2CtxTag = $('#v2CtxTag');
    els.v2RefLinks = $('#v2RefLinks');
    els.v2RefNote = $('#v2RefNote');
    els.v2FontMix = $('#v2FontMix');
    els.v2Grain = $('#v2Grain');
    els.v2MixNote = $('#v2MixNote');
    els.v2Density = $('#v2Density');
    els.v2KitName = $('#v2KitName');
    els.v2KitList = $('#v2KitList');
    els.v2KitJson = $('#v2KitJson');
    els.v2BlueprintText = $('#v2BlueprintText');
    els.v2BpState = $('#v2BpState');
    els.v2BpMeta = $('#v2BpMeta');
    els.v2BpWarnings = $('#v2BpWarnings');
    els.v2Grid = $('#v2Grid');
    els.v2SetName = $('#v2SetName');
    els.v2Meta = $('#v2Meta');
    els.v2Warnings = $('#v2Warnings');

    applyTheme(localStorage.getItem(STORE.theme) || 'light');

    const draft = readJSON(STORE.draft, null);
    state.project = draft && draft.project ? C.sanitizeProject(draft.project) : C.createProject();
    state.script = normalizeScript(draft && draft.script);
    state.selected = C.clamp(parseInt(draft && draft.selected, 10) || 0, 0, state.project.slides.length - 1);
    state.splitCount = 4;

    const v2prefs = readJSON(STORE.v2, null);
    if (v2prefs && typeof v2prefs === 'object') {
      if (v2prefs.fontMix) state.v2.fontMix = String(v2prefs.fontMix);
      if (v2prefs.grain) state.v2.grain = String(v2prefs.grain);
    }
    const kitName = readJSON(STORE.brandKits + ':name', '');
    if (kitName && els.v2KitName) els.v2KitName.value = kitName;

    buildControls();
    bind();
    renderProviders();
    renderBridge();
    loadGemini();
    applyScriptInputs();
    renderAll(true);
    switchTab('cards');

    // 웹폰트가 준비되면 캔버스를 다시 그린다(첫 렌더가 대체 폰트일 수 있음)
    if (document.fonts && document.fonts.ready) {
      document.fonts.load('700 48px PlexKR').catch(() => {});
      document.fonts.load('400 32px PlexKR').catch(() => {});
      document.fonts.ready.then(() => {
        renderStage();
        renderList();
      });
    }

    // 창 크기가 바뀌면 썸네일 해상도만 갱신
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { renderStage(); renderList(); }, 150);
    });

    window.__studio = {
      state,
      C,
      render: renderAll,
      drawSlide,
      download,
      selectSlide,
      switchTab,
      recommendDesign,
      applyDesignRef,
      clearDesign,
      useReferenceImage,
      applyPalette,
      correctSelected,
      parseBridgeNow,
      applyBridge,
      generateWithGemini,
      openCopyLab,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
