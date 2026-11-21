/* ============================================================
   카드뉴스·대본 스튜디오 · preset-render.js
   핀터레스트 디자인 엔진(DesignRef)의 4축 DNA로 카드를 그린다.
     · 레이아웃 존(layoutPlan) · 팔레트 · 타이포 · 그래픽
     · 실사 사진(cover 크롭 + 오버레이) · 사진 없는 디자인 대체 블록
   core.js(StudioCore)의 순수 계산만 사용한다. DOM 없음.
   ============================================================ */
(function () {
  'use strict';

  const C = window.StudioCore;
  const FONT = 'PlexKR, "IBM Plex Sans KR", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const SERIF = '"AppleMyeongjo", "Nanum Myeongjo", "Noto Serif KR", Georgia, "Times New Roman", serif';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

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

  function setFont(ctx, size, weight, family) {
    ctx.font = `${weight} ${Math.max(1, Math.round(size))}px ${family || FONT}`;
  }

  function familyOf(dna, role) {
    const fam = role === 'body' ? dna.type.bodyFamily : dna.type.displayFamily;
    return fam === 'serif' ? SERIF : fam === 'mono' ? MONO : FONT;
  }

  /**
   * 한국어 줄바꿈: 글자 단위가 아니라 어절(공백) 단위로 끊는다.
   * "충분합니 / 다" 같은 단어 중간 분리를 막고, **강조** 런은 그대로 유지한다.
   */
  function wrapWords(ctx, text, size, maxW, weight, emWeight, family, flags) {
    const measure = (t, em) => {
      setFont(ctx, size, em ? emWeight : weight, family);
      return ctx.measureText(t).width;
    };
    const words = [];
    String(text == null ? '' : text).split('\n').forEach((paragraph, pi) => {
      if (pi > 0) words.push({ br: true });
      C.parseRuns(paragraph).forEach(run => {
        const parts = String(run.text).match(/\S+\s*/g) || [];
        if (!parts.length && run.text) words.push({ text: run.text, em: run.em });
        parts.forEach(p => words.push({ text: p, em: run.em }));
      });
    });

    const lines = [];
    let line = [];
    let width = 0;
    const push = () => { if (line.length) lines.push(line); line = []; width = 0; };

    words.forEach(word => {
      if (word.br) { push(); return; }
      let t = word.text;
      let w = measure(t, word.em);
      if (width + w > maxW && line.length) {
        push();
        t = t.replace(/^\s+/, '');
        if (!t) return;
        w = measure(t, word.em);
      }
      if (w > maxW) {
        /* 단어 자체가 폭보다 길 때만 글자로 쪼갠다 */
        let buf = '';
        Array.from(t).forEach(ch => {
          const test = buf + ch;
          if (buf && measure(test, word.em) > maxW) {
            if (flags) flags.brokeWord = true;
            line.push({ text: buf, em: word.em });
            push();
            buf = ch;
          } else buf = test;
        });
        if (buf) { line.push({ text: buf, em: word.em }); width = measure(buf, word.em); }
        return;
      }
      line.push({ text: t, em: word.em });
      width += w;
    });
    push();

    return lines.map(l => {
      const merged = [];
      l.forEach(t => {
        const last = merged[merged.length - 1];
        if (last && last.em === t.em) last.text += t.text;
        else merged.push({ text: t.text, em: t.em });
      });
      return merged
        .map(r => ({ text: r.em ? r.text : r.text.replace(/\s+$/, ''), em: r.em }))
        .filter(r => r.text);
    }).filter(l => l.length);
  }

  function lineWidth(ctx, runs, size, weight, emWeight, family) {
    return runs.reduce((w, run) => {
      setFont(ctx, size, run.em ? emWeight : weight, family);
      return w + ctx.measureText(run.text).width;
    }, 0);
  }

  function drawTextBlock(ctx, lines, x, yTop, size, lh, o) {
    lines.forEach((runs, i) => {
      const total = lineWidth(ctx, runs, size, o.weight, o.emWeight, o.family);
      let cx = o.align === 'center' ? x + ((o.width || 0) - total) / 2
        : o.align === 'right' ? x + (o.width || 0) - total : x;
      const baseY = yTop + size * 0.84 + i * lh;
      runs.forEach(run => {
        setFont(ctx, size, run.em ? o.emWeight : o.weight, o.family);
        ctx.fillStyle = run.em ? (o.emColor || o.color) : o.color;
        ctx.fillText(run.text, cx, baseY);
        cx += ctx.measureText(run.text).width;
      });
    });
  }

  /** 짧은 라벨용 자간 그리기(배지·킥커·푸터) */
  function drawTracked(ctx, text, x, y, o) {
    const chars = Array.from(String(text || ''));
    const gap = o.spacing || 0;
    setFont(ctx, o.size, o.weight, o.family);
    const widths = chars.map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
    let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    ctx.fillStyle = o.color;
    chars.forEach((ch, i) => {
      ctx.fillText(ch, cx, y);
      cx += widths[i] + gap;
    });
    return total;
  }

  /* ── 사진 영역 ─────────────────────────────────────────── */
  function drawPhoto(ctx, img, rect, o) {
    const radius = Math.max(0, o.radius || 0);
    ctx.save();
    if (radius) { roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius); ctx.clip(); }
    else { ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip(); }

    if (img && img.naturalWidth) {
      if (o.filter) ctx.filter = o.filter;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const target = rect.w / rect.h;
      let sw = iw, sh = ih, sx = 0, sy = 0;
      if (iw / ih > target) { sw = ih * target; sx = (iw - sw) / 2; }
      else { sh = iw / target; sy = (ih - sh) / 2; }
      if (o.focal === 'upper-third') sy = Math.min(sy, (ih - sh) * 0.3);
      if (o.focal === 'left') sx = 0;
      if (o.focal === 'right') sx = iw - sw;
      ctx.drawImage(img, sx, sy, sw, sh, rect.x, rect.y, rect.w, rect.h);
      ctx.filter = 'none';
    } else {
      /* 사진이 없을 때: 회색 박스 대신 그 자리에 맞는 그래픽 블록 */
      drawFallback(ctx, rect, o, o.fallback || 'geometric');
    }
    ctx.restore();

    if (o.border) {
      ctx.strokeStyle = o.borderColor || o.ink;
      ctx.lineWidth = o.border;
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
      ctx.stroke();
    }
  }

  /** 사진이 없을 때의 대체 그래픽 6종 (빈 회색 박스를 만들지 않는다) */
  function drawFallback(ctx, rect, o, kind) {
    const R = rect;
    const u = o.unit || 8;
    const accent = o.accent;
    const ink = o.ink;
    const soft = C.rgba(accent, 0.14);
    ctx.fillStyle = o.fallbackBg;
    ctx.fillRect(R.x, R.y, R.w, R.h);

    if (kind === 'editorial') {
      ctx.strokeStyle = C.rgba(ink, 0.12);
      ctx.lineWidth = Math.max(1, u * 0.08);
      for (let i = 1; i < 6; i++) {
        const x = R.x + (R.w / 6) * i;
        ctx.beginPath(); ctx.moveTo(x, R.y + R.h * 0.12); ctx.lineTo(x, R.y + R.h * 0.88); ctx.stroke();
      }
      ctx.fillStyle = C.rgba(accent, 0.08);
      ctx.fillRect(R.x, R.y, R.w, R.h);
      ctx.fillStyle = C.rgba(accent, 0.16);
      ctx.fillRect(R.x, R.y, R.w * 0.34, R.h);
      ctx.fillStyle = C.rgba(accent, 0.65);
      setFont(ctx, R.h * 0.3, 400, SERIF);
      ctx.fillText('“', R.x + R.w * 0.07, R.y + R.h * 0.5);
      ctx.fillStyle = C.rgba(accent, 0.6);
      ctx.fillRect(R.x + R.w * 0.07, R.y + R.h * 0.82, R.w * 0.14, Math.max(1, u * 0.12));
      return;
    }

    if (kind === 'product') {
      const g = ctx.createRadialGradient(R.x + R.w * 0.5, R.y + R.h * 0.45, 0, R.x + R.w * 0.5, R.y + R.h * 0.45, R.w * 0.7);
      g.addColorStop(0, C.rgba(accent, 0.07));
      g.addColorStop(1, C.rgba(accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(R.x, R.y, R.w, R.h);
      ctx.fillStyle = C.rgba(ink, 0.06);
      ctx.beginPath();
      ctx.ellipse(R.x + R.w * 0.5, R.y + R.h * 0.84, R.w * 0.2, R.h * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = C.rgba(ink, 0.14);
      ctx.shadowBlur = R.h * 0.05;
      ctx.shadowOffsetY = R.h * 0.02;
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, R.x + R.w * 0.33, R.y + R.h * 0.26, R.w * 0.34, R.h * 0.56, R.w * 0.03);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.rgba(ink, 0.08);
      ctx.lineWidth = Math.max(1, u * 0.08);
      roundRect(ctx, R.x + R.w * 0.33, R.y + R.h * 0.26, R.w * 0.34, R.h * 0.56, R.w * 0.03);
      ctx.stroke();
      ctx.fillStyle = C.rgba(accent, 0.85);
      ctx.fillRect(R.x + R.w * 0.33, R.y + R.h * 0.26, R.w * 0.34, R.h * 0.09);
      ctx.fillStyle = C.rgba(ink, 0.2);
      ctx.fillRect(R.x + R.w * 0.37, R.y + R.h * 0.44, R.w * 0.26, Math.max(2, R.h * 0.012));
      ctx.fillStyle = C.rgba(ink, 0.12);
      ctx.fillRect(R.x + R.w * 0.37, R.y + R.h * 0.49, R.w * 0.18, Math.max(2, R.h * 0.01));
      ctx.fillStyle = C.rgba(ink, 0.12);
      ctx.fillRect(R.x + R.w * 0.37, R.y + R.h * 0.57, R.w * 0.22, Math.max(2, R.h * 0.01));
      return;
    }

    if (kind === 'bento' || kind === 'grid') {
      const gap = R.w * 0.035;
      const card = (x, y, w, h, fill, stroke) => {
        ctx.fillStyle = fill;
        roundRect(ctx, x, y, w, h, R.w * 0.03);
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = Math.max(1, u * 0.08);
          roundRect(ctx, x, y, w, h, R.w * 0.03);
          ctx.stroke();
        }
      };
      const cw = (R.w - gap * 2) / 2;
      const ch = (R.h - gap * 2) / 2;
      card(R.x, R.y, cw, ch, C.rgba(accent, 0.1), null);
      card(R.x + cw + gap, R.y, cw, ch, '#FFFFFF', C.rgba(ink, 0.08));
      card(R.x, R.y + ch + gap, cw, ch, '#FFFFFF', C.rgba(ink, 0.08));
      card(R.x + cw + gap, R.y + ch + gap, cw, ch, C.rgba(ink, 0.05), null);
      /* 첫 카드: 미니 바 차트, 둘째: 동그라미, 셋째: 괘선, 넷째: 도트 */
      ctx.fillStyle = C.rgba(accent, 0.9);
      [0.32, 0.48, 0.4, 0.62].forEach((v, i) => {
        ctx.fillRect(R.x + cw * 0.16 + i * cw * 0.16, R.y + ch * (0.82 - v), cw * 0.08, ch * v);
      });
      ctx.strokeStyle = C.rgba(accent, 0.8);
      ctx.lineWidth = Math.max(2, u * 0.2);
      ctx.beginPath();
      ctx.arc(R.x + cw + gap + cw * 0.5, R.y + ch * 0.5, Math.min(cw, ch) * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.rgba(ink, 0.18);
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(R.x + cw * 0.16, R.y + ch + gap + ch * (0.3 + i * 0.16), cw * (0.66 - i * 0.12), Math.max(2, u * 0.12));
      }
      const step = Math.max(6, u * 1.1);
      ctx.fillStyle = C.rgba(ink, 0.2);
      for (let x = R.x + cw + gap + step; x < R.x + R.w - step * 0.5; x += step) {
        for (let y = R.y + ch + gap + step; y < R.y + R.h - step * 0.5; y += step) {
          ctx.beginPath(); ctx.arc(x, y, Math.max(1, u * 0.14), 0, Math.PI * 2); ctx.fill();
        }
      }
      return;
    }

    if (kind === 'brutal') {
      ctx.fillStyle = C.rgba(ink, 0.06);
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 5; j++) {
          ctx.beginPath();
          ctx.arc(R.x + R.w * (0.08 + i * 0.14), R.y + R.h * (0.1 + j * 0.2), Math.max(1, u * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(R.x + R.w * 0.42, R.y + R.h * 0.5);
      ctx.rotate(-0.08);
      ctx.fillStyle = accent;
      ctx.fillRect(-R.w * 0.2, -R.h * 0.2, R.w * 0.4, R.h * 0.4);
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(3, u * 0.38);
      ctx.strokeRect(-R.w * 0.2, -R.h * 0.2, R.w * 0.4, R.h * 0.4);
      ctx.restore();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(R.x + R.w * 0.78, R.y + R.h * 0.3, R.h * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(R.x + R.w * 0.72, R.y + R.h * 0.27, R.w * 0.12, Math.max(2, R.h * 0.012));
      return;
    }

    if (kind === 'pop') {
      ctx.fillStyle = C.rgba(accent, 0.2);
      ctx.beginPath();
      ctx.arc(R.x + R.w * 0.74, R.y + R.h * 0.62, Math.min(R.w, R.h) * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, R.x + R.w * 0.18, R.y + R.h * 0.26, R.w * 0.44, R.h * 0.5, R.w * 0.06);
      ctx.fill();
      ctx.save();
      ctx.translate(R.x + R.w * 0.3, R.y + R.h * 0.42);
      ctx.rotate(-0.05);
      ctx.fillStyle = accent;
      roundRect(ctx, 0, 0, R.w * 0.2, R.h * 0.12, R.w * 0.02);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.rgba(ink, 0.14);
      ctx.fillRect(R.x + R.w * 0.22, R.y + R.h * 0.62, R.w * 0.26, Math.max(2, u * 0.16));
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(R.x + R.w * 0.56, R.y + R.h * 0.2, R.h * 0.035, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    /* geometric */
    ctx.fillStyle = C.rgba(accent, 0.16);
    ctx.beginPath();
    ctx.arc(R.x + R.w * 0.72, R.y + R.h * 0.66, Math.min(R.w, R.h) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.rgba(accent, 0.55);
    ctx.lineWidth = Math.max(1.2, u * 0.1);
    ctx.beginPath();
    ctx.arc(R.x + R.w * 0.72, R.y + R.h * 0.66, Math.min(R.w, R.h) * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.rgba(ink, 0.14);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(R.x + R.w * 0.1, R.y + R.h * (0.22 + i * 0.05), R.w * (0.3 - i * 0.06), Math.max(2, u * 0.12));
    }
    ctx.strokeStyle = C.rgba(ink, 0.2);
    ctx.beginPath();
    ctx.moveTo(R.x + R.w * 0.1, R.y + R.h * 0.82);
    ctx.lineTo(R.x + R.w * 0.44, R.y + R.h * 0.82);
    ctx.stroke();
  }

  function drawScrim(ctx, rect, color, opacity, band) {
    const k = Math.max(0, Math.min(1, band || 1));
    const y0 = rect.y + rect.h * (1 - k);
    const g = ctx.createLinearGradient(0, y0, 0, rect.y + rect.h);
    g.addColorStop(0, C.rgba(color, 0));
    g.addColorStop(0.45, C.rgba(color, opacity * 0.72));
    g.addColorStop(1, C.rgba(color, opacity));
    ctx.fillStyle = g;
    ctx.fillRect(rect.x, y0, rect.w, rect.h * k);
  }

  /* ── 배지 ──────────────────────────────────────────────── */
  function drawBadge(ctx, text, zone, style, o) {
    if (!text) return;
    const size = Math.max(6, o.micro);
    const padX = size * 0.9;
    const h = size * 1.9;
    setFont(ctx, size, 700, o.family);
    const tw = ctx.measureText(text).width + padX * 2;
    const w = Math.min(tw, o.W - zone.x - size);
    let x = zone.x;
    let y = zone.y;

    if (style === 'rule') {
      ctx.fillStyle = o.accent;
      ctx.fillRect(x, y + h * 0.18, size * 0.62, size * 0.62);
      drawTracked(ctx, text, x + size * 1.05, y + h * 0.62, {
        size: size * 0.92, weight: 700, color: o.ink, spacing: size * 0.16, family: o.family,
      });
      return;
    }
    if (style === 'minimal') {
      drawTracked(ctx, text, x, y + h * 0.66, {
        size: size * 0.92, weight: 600, color: o.ink, spacing: size * 0.26, family: o.family,
      });
      return;
    }

    if (style === 'sticker') {
      ctx.save();
      ctx.translate(x, y + h / 2);
      ctx.rotate(-0.06);
      ctx.fillStyle = o.ink;
      ctx.fillRect(-w / 2 + size * 0.18, -h / 2 + size * 0.18, w, h);
      ctx.fillStyle = o.accent;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = o.ink;
      ctx.lineWidth = Math.max(1.5, size * 0.14);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = o.ink;
      setFont(ctx, size, 700, o.family);
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, size * 0.36);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }

    if (style === 'neon') {
      ctx.fillStyle = C.rgba(o.bg, 0.62);
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.fill();
      ctx.strokeStyle = o.accent;
      ctx.lineWidth = Math.max(1.2, size * 0.1);
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.stroke();
      drawTracked(ctx, text, x + padX, y + h * 0.66, {
        size: size * 0.9, weight: 700, color: o.accent, spacing: size * 0.1, family: o.family,
      });
      return;
    }

    if (style === 'soft') {
      ctx.fillStyle = o.accentSoft;
      roundRect(ctx, x, y, w, h, h * 0.24);
      ctx.fill();
      drawTracked(ctx, text, x + padX, y + h * 0.66, {
        size: size * 0.9, weight: 700, color: o.accent, spacing: size * 0.08, family: o.family,
      });
      return;
    }

    /* solid · pill · pill-solid */
    ctx.fillStyle = o.accent;
    roundRect(ctx, x, y, w, h, /pill/.test(style) || style === 'solid' ? h / 2 : h * 0.2);
    ctx.fill();
    drawTracked(ctx, text, x + padX, y + h * 0.66, {
      size: size * 0.9, weight: 700, color: o.accentInk, spacing: size * 0.08, family: o.family,
    });
  }

  /* ── CTA ───────────────────────────────────────────────── */
  function drawCta(ctx, label, zone, o) {
    if (!label) return;
    const size = Math.max(6, o.body);
    const h = Math.min(zone.h, size * 2.5);
    const y = zone.y + (zone.h - h) / 2;
    setFont(ctx, size, 700, o.family);
    const tw = ctx.measureText(label).width;
    const w = Math.min(zone.w, tw + size * 2.6);
    const radius = /999|pill/.test(String(o.radius)) ? h / 2 : Math.min(o.radius || 0, h / 2);

    if (o.style === 'text') {
      drawTracked(ctx, label, zone.x, y + h * 0.66, {
        size: size * 0.92, weight: 700, color: o.accent, spacing: size * 0.16, family: o.family,
      });
      ctx.fillStyle = C.rgba(o.accent, 0.9);
      ctx.fillRect(zone.x, y + h * 0.84, Math.min(w, tw + size), Math.max(1, size * 0.06));
      return;
    }
    if (o.style === 'outline') {
      ctx.strokeStyle = o.accent;
      ctx.lineWidth = Math.max(1.5, size * 0.08);
      roundRect(ctx, zone.x, y, w, h, radius);
      ctx.stroke();
      ctx.fillStyle = o.accent;
      setFont(ctx, size, 700, o.family);
      ctx.fillText(label, zone.x + (w - tw) / 2, y + h / 2 + size * 0.36);
      return;
    }
    if (o.style === 'block') {
      ctx.fillStyle = o.blockColor;
      ctx.fillRect(zone.x + h * 0.14, y + h * 0.14, w, h);
      ctx.fillStyle = o.accent;
      ctx.fillRect(zone.x, y, w, h);
      ctx.strokeStyle = o.blockColor;
      ctx.lineWidth = Math.max(1.5, size * 0.12);
      ctx.strokeRect(zone.x, y, w, h);
      ctx.fillStyle = o.blockInk;
      setFont(ctx, size, 800, o.family);
      ctx.fillText(label, zone.x + (w - tw) / 2, y + h / 2 + size * 0.36);
      return;
    }
    ctx.fillStyle = o.accent;
    roundRect(ctx, zone.x, y, w, h, radius);
    ctx.fill();
    ctx.fillStyle = o.accentInk;
    setFont(ctx, size, 700, o.family);
    ctx.fillText(label, zone.x + (w - tw) / 2, y + h / 2 + size * 0.36);
  }

  function drawFooter(ctx, content, o) {
    const size = Math.max(5, o.micro * 0.92);
    const y = o.H - o.margin * 0.55;
    ctx.fillStyle = o.sub;
    if (content.handle) {
      drawTracked(ctx, content.handle, o.alignCenter ? o.W / 2 : o.margin, y, {
        size, weight: 500, color: o.sub, spacing: size * 0.06, family: o.family,
        align: o.alignCenter ? 'center' : 'left',
      });
    }
    if (!o.alignCenter) {
      drawTracked(ctx, content.page, o.W - o.margin, y, {
        size, weight: 500, color: o.sub, spacing: size * 0.06, family: o.family, align: 'right',
      });
    } else if (content.handle) {
      drawTracked(ctx, content.page, o.W / 2, y + size * 1.6, {
        size, weight: 500, color: o.sub, spacing: size * 0.06, family: o.family, align: 'center',
      });
    }
  }

  /* ── 본문 줄 맞춤 ──────────────────────────────────────── */
  function fitBody(ctx, text, maxW, maxLines, o) {
    if (!String(text || '').trim()) return { lines: [], truncated: false, size: o.size };
    let size = o.size;
    let lines = [];
    for (let guard = 0; guard < 12; guard++) {
      const flags = {};
      lines = wrapWords(ctx, text, size, maxW, o.weight, o.emWeight, o.family, flags);
      if ((lines.length <= maxLines && !flags.brokeWord) || size <= o.min) break;
      size = Math.max(o.min, Math.round(size * 0.9));
    }
    return { lines: lines.slice(0, maxLines), size, truncated: lines.length > maxLines };
  }

  function drawBodyLines(ctx, body, x, yTop, maxW, maxLines, o) {
    const fit = fitBody(ctx, body, maxW, maxLines, o);
    if (!fit.lines.length) return { height: 0, size: fit.size };
    const size = fit.size;
    const lh = Math.round(size * o.lineHeight);
    fit.lines.forEach((runs, i) => {
      const isLast = i === fit.lines.length - 1;
      if (isLast && fit.truncated) {
        const tail = runs[runs.length - 1];
        if (tail) tail.text = tail.text.replace(/\s+$/, '') + '…';
      }
      const total = runs.reduce((w, run) => {
        setFont(ctx, size, run.em ? o.emWeight : o.weight, o.family);
        return w + ctx.measureText(run.text).width;
      }, 0);
      let cx = o.align === 'center' ? x + (maxW - total) / 2 : x;
      const baseY = yTop + size * 0.82 + i * lh;
      runs.forEach(run => {
        setFont(ctx, size, run.em ? o.emWeight : o.weight, o.family);
        ctx.fillStyle = run.em ? (o.emColor || o.color) : o.color;
        ctx.fillText(run.text, cx, baseY);
        cx += ctx.measureText(run.text).width;
      });
    });
    return { height: fit.lines.length * lh, size, lines: fit.lines.length };
  }

  function fitTitle(ctx, text, zoneW, maxLines, o) {
    let size = o.size;
    let lines = [];
    for (let guard = 0; guard < 30; guard++) {
      const flags = {};
      lines = wrapWords(ctx, text, size, zoneW, o.weight, o.emWeight, o.family, flags);
      const lh = Math.round(size * o.lineHeight);
      const fits = lines.length <= maxLines && lines.length * lh <= o.maxHeight && !flags.brokeWord;
      if (fits || size <= o.min) break;
      size = Math.max(o.min, Math.round(size * 0.94));
    }
    return { size, lines, lh: Math.round(size * o.lineHeight) };
  }

  /* ── 8개 구조 ──────────────────────────────────────────── */
  const STRUCTURES = {
    /* ① 스위스 타이포 매거진 */
    'swiss-grid'(ctx, p) {
      const { W, H, P, s, color, content, img, plan, t, dna, index } = p;
      const m = plan.zones.text.x;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      /* 12열 격자 + 외곽 프레임 */
      ctx.strokeStyle = C.rgba(color.ink, 0.1);
      ctx.lineWidth = Math.max(1, P(1));
      ctx.strokeRect(m * 0.5, m * 0.5, W - m, H - m);
      ctx.strokeStyle = C.rgba(color.ink, 0.055);
      for (let i = 1; i < 4; i++) {
        const x = W * (0.25 * i);
        ctx.beginPath(); ctx.moveTo(x, m * 0.5); ctx.lineTo(x, H - m * 0.5); ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const y = H * (i / 6);
        ctx.beginPath(); ctx.moveTo(m * 0.5, y); ctx.lineTo(W - m * 0.5, y); ctx.stroke();
      }

      /* 우측 상단 큰 섹션 번호 */
      const num = String(index + 1).padStart(2, '0');
      setFont(ctx, P(74), 700, familyOf(dna, 'display'));
      ctx.fillStyle = C.rgba(color.ink, 0.14);
      ctx.textAlign = 'right';
      ctx.fillText(num, W - m, m + P(52));
      ctx.textAlign = 'left';

      /* 이미지 존 */
      const ir = plan.zones.image;
      ctx.save();
      ctx.shadowColor = C.rgba(color.ink, 0.12);
      ctx.shadowBlur = P(18);
      ctx.shadowOffsetY = P(8);
      ctx.fillStyle = color.surface;
      ctx.fillRect(ir.x, ir.y, ir.w, ir.h);
      ctx.restore();
      drawPhoto(ctx, img, ir, {
        fallback: 'geometric', fallbackBg: color.accentSoft, accent: color.accent,
        ink: color.ink, unit: P(8), radius: 0,
      });
      ctx.strokeStyle = C.rgba(color.ink, 0.18);
      ctx.lineWidth = Math.max(1, P(1));
      ctx.strokeRect(ir.x, ir.y, ir.w, ir.h);
      drawTracked(ctx, content.kicker + ' — ' + content.page, ir.x, ir.y + ir.h + P(18), {
        size: P(8), weight: 500, color: color.sub, spacing: P(1.6), family: FONT,
      });

      /* 텍스트 존 */
      const z = plan.zones.text;
      const bottomLimit = H - m * 0.9;
      const kick = P(10);
      ctx.fillStyle = color.accent;
      ctx.fillRect(z.x, z.y - P(14), P(34), Math.max(1.5, P(2)));
      drawTracked(ctx, content.kicker, z.x, z.y + kick * 2.1, {
        size: kick, weight: 700, color: color.accent, spacing: kick * 0.22, family: FONT,
      });
      const titleTop = z.y + kick * 4;
      const ctaH = plan.zones.cta.h + P(14);
      const title = fitTitle(ctx, content.title, z.w, 4, {
        size: P(t.type.roles.display.size), min: P(30), weight: dna.type.displayWeight,
        emWeight: dna.type.displayWeight, family: familyOf(dna, 'display'),
        lineHeight: 1.06, maxHeight: (bottomLimit - titleTop - ctaH) * 0.72,
      });
      drawTextBlock(ctx, title.lines, z.x, titleTop, title.size, title.lh, {
        weight: dna.type.displayWeight, emWeight: dna.type.displayWeight,
        family: familyOf(dna, 'display'), color: color.ink, emColor: color.accent,
        align: 'left', width: z.w,
      });
      const bodyTop = titleTop + title.lines.length * title.lh + P(18);
      const room = bottomLimit - bodyTop - ctaH;
      if (content.body && room > P(30)) {
        drawBodyLines(ctx, content.body, z.x, bodyTop, z.w, Math.max(1, Math.floor(room / (P(17) * 1.7))), {
          size: P(t.type.roles.body.size), min: P(11), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.62, color: color.sub, emColor: color.ink,
        });
      }
      drawCta(ctx, content.cta, plan.zones.cta, {
        body: P(t.type.roles.body.size), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: '999', style: 'solid',
      });
      drawBadge(ctx, content.badge, plan.zones.badge, 'rule', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, ink: color.ink, family: FONT, bg: color.bg,
      });
      drawFooter(ctx, content, { W, H, margin: m, micro: P(9), sub: color.sub, family: FONT });
    },

    /* ② 벤토 그리드 SaaS */
    'bento-modular'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna } = p;
      const m = plan.zones.text.x;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      const ir = plan.zones.image;
      const cardR = P(20);
      ctx.save();
      ctx.shadowColor = C.rgba(color.ink, 0.1);
      ctx.shadowBlur = P(26);
      ctx.shadowOffsetY = P(10);
      ctx.fillStyle = color.surface;
      roundRect(ctx, ir.x, ir.y, ir.w, ir.h, cardR);
      ctx.fill();
      ctx.restore();
      drawPhoto(ctx, img, { x: ir.x + P(8), y: ir.y + P(8), w: ir.w - P(16), h: ir.h - P(16) }, {
        fallback: 'bento', fallbackBg: color.surface, accent: color.accent, ink: color.ink,
        unit: P(8), radius: cardR * 0.8,
      });

      const z = plan.zones.text;
      const cardTop = z.y - P(22);
      const cardH = z.h + P(44);
      ctx.save();
      ctx.shadowColor = C.rgba(color.ink, 0.08);
      ctx.shadowBlur = P(22);
      ctx.shadowOffsetY = P(8);
      ctx.fillStyle = color.surface;
      roundRect(ctx, z.x, cardTop, z.w, cardH, cardR);
      ctx.fill();
      ctx.restore();

      const innerX = z.x + P(24);
      const innerW = z.w - P(48);
      const title = fitTitle(ctx, content.title, innerW, 2, {
        size: P(t.type.roles.display.size * 0.82), min: P(24), weight: 800, emWeight: 800,
        family: familyOf(dna, 'display'), lineHeight: 1.22, maxHeight: cardH * 0.52,
      });
      drawTextBlock(ctx, title.lines, innerX, cardTop + P(22), title.size, title.lh, {
        weight: 800, emWeight: 800, family: familyOf(dna, 'display'), color: color.ink,
        emColor: color.accent, align: 'left', width: innerW,
      });
      const bodyTop = cardTop + P(22) + title.lines.length * title.lh + P(10);
      const room = cardTop + cardH - P(14) - bodyTop;
      if (content.body && room > P(24)) {
        drawBodyLines(ctx, content.body, innerX, bodyTop, innerW, Math.max(1, Math.floor(room / (P(15) * 1.6))), {
          size: P(t.type.roles.body.size), min: P(10), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.62, color: color.sub, emColor: color.ink,
        });
      }
      drawBadge(ctx, content.badge, plan.zones.badge, 'pill', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        ink: color.ink, family: FONT, bg: color.bg,
      });
      drawCta(ctx, content.cta, plan.zones.cta, {
        body: P(t.type.roles.body.size), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: P(12), style: 'solid',
      });
      drawFooter(ctx, content, { W, H, margin: m, micro: P(9), sub: color.sub, family: FONT });
    },

    /* ③ 크림 에디토리얼 (홀수 장은 좌우 반전) */
    'split-editorial'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna, index } = p;
      const m = plan.zones.text.x;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      const flip = index % 2 === 1;
      const imgRect = flip
        ? { x: W * 0.45, y: 0, w: W * 0.55, h: H }
        : { x: 0, y: 0, w: W * 0.55, h: H };
      const textZone = flip
        ? { x: W * 0.08, y: plan.zones.text.y, w: W * 0.36, h: plan.zones.text.h }
        : { x: W * 0.59, y: plan.zones.text.y, w: W * 0.36, h: plan.zones.text.h };

      drawPhoto(ctx, img, imgRect, {
        fallback: 'editorial', fallbackBg: color.accentSoft, accent: color.accent, ink: color.ink,
        unit: P(8), radius: 0, focal: 'center', filter: 'sepia(0.14) saturate(0.94) contrast(1.02)',
      });

      /* 텍스트 컬럼의 얇은 세로 괘선 */
      ctx.strokeStyle = C.rgba(color.ink, 0.16);
      ctx.lineWidth = Math.max(1, P(0.8));
      ctx.beginPath();
      ctx.moveTo(flip ? W * 0.45 : W * 0.55, 0);
      ctx.lineTo(flip ? W * 0.45 : W * 0.55, H);
      ctx.stroke();

      const z = textZone;
      const kickTop = z.y;
      ctx.fillStyle = color.accent;
      ctx.fillRect(z.x, kickTop - P(12), P(30), Math.max(1.5, P(1.6)));
      drawTracked(ctx, content.kicker, z.x, kickTop + P(18), {
        size: P(9), weight: 600, color: color.accent, spacing: P(2.4), family: FONT,
      });
      const titleTop = kickTop + P(66);
      const ctaH = plan.zones.cta.h + P(20);
      const title = fitTitle(ctx, content.title, z.w, 5, {
        size: P(t.type.roles.display.size), min: P(26), weight: 700, emWeight: 700,
        family: familyOf(dna, 'display'), lineHeight: 1.12,
        maxHeight: (H - z.y - ctaH - P(40)) * 0.62,
      });
      drawTextBlock(ctx, title.lines, z.x, titleTop, title.size, title.lh, {
        weight: 700, emWeight: 700, family: familyOf(dna, 'display'), color: color.ink,
        emColor: color.accent, align: 'left', width: z.w,
      });
      const bodyTop = titleTop + title.lines.length * title.lh + P(16);
      const room = H - z.y - ctaH - P(40) - (bodyTop - z.y);
      if (content.body && room > P(26)) {
        drawBodyLines(ctx, content.body, z.x, bodyTop, z.w, Math.max(1, Math.floor(room / (P(14) * 1.78))), {
          size: P(t.type.roles.body.size), min: P(9), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.78, color: color.sub, emColor: color.ink,
        });
      }
      const initial = (content.badge || 'C').replace(/[^A-Za-z가-힣0-9]/g, '').slice(0, 1) || 'C';
      setFont(ctx, P(118), 400, familyOf(dna, 'display'));
      ctx.fillStyle = C.rgba(color.accent, 0.12);
      ctx.textAlign = 'right';
      ctx.fillText(initial, z.x + z.w, H * 0.8);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.rgba(color.accent, 0.35);
      ctx.fillRect(z.x, H * 0.735, P(26), Math.max(1, P(1)));
      drawCta(ctx, content.cta, { x: z.x, y: H * 0.86, w: z.w, h: plan.zones.cta.h }, {
        body: P(t.type.roles.body.size * 0.92), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: '999', style: 'solid',
      });
      drawBadge(ctx, content.badge, { x: flip ? W - W * 0.24 : W * 0.04, y: H * 0.055 }, 'soft', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        accentSoft: color.accentSoft, ink: color.ink, family: FONT, bg: color.bg,
      });
      drawFooter(ctx, content, { W, H, margin: P(34), micro: P(9), sub: color.sub, family: FONT });
    },

    /* ④ 다크 네온 임팩트 */
    'full-bleed-photo'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna, safety } = p;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);
      const full = { x: 0, y: 0, w: W, h: H };
      drawPhoto(ctx, img, full, {
        fallback: 'geometric', fallbackBg: color.surface, accent: color.accent, ink: color.ink,
        unit: P(8), radius: 0, filter: 'grayscale(0.6) brightness(0.62) contrast(1.18)',
      });
      if (!img) {
        const g = ctx.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, W * 0.85);
        g.addColorStop(0, C.rgba(color.accent, 0.16));
        g.addColorStop(1, C.rgba(color.accent, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const opacity = Math.max(0.62, (safety && Number(safety.minOpacity)) || 0.56);
      drawScrim(ctx, full, '#000000', Math.min(0.9, opacity), 0.72);
      drawScrim(ctx, full, color.bg, 0.55, 0.22);

      /* 상단 네온 룰 */
      ctx.fillStyle = color.accent;
      ctx.fillRect(plan.zones.text.x, P(26), W - plan.zones.text.x * 2, Math.max(1.5, P(2)));

      const z = plan.zones.text;
      drawTracked(ctx, content.kicker, z.x, z.y + P(6), {
        size: P(10), weight: 700, color: color.accent, spacing: P(2.6), family: FONT,
      });
      const titleTop = z.y + P(26);
      const ctaTop = H * 0.87;
      const title = fitTitle(ctx, content.title, z.w, 4, {
        size: P(t.type.roles.display.size * 1.06), min: P(28), weight: 900, emWeight: 900,
        family: familyOf(dna, 'display'), lineHeight: 1.0, maxHeight: (ctaTop - titleTop) * 0.68,
      });
      drawTextBlock(ctx, title.lines, z.x, titleTop, title.size, title.lh, {
        weight: 900, emWeight: 900, family: familyOf(dna, 'display'), color: '#FFFFFF',
        emColor: color.accent, align: 'left', width: z.w,
      });
      const bodyTop = titleTop + title.lines.length * title.lh + P(14);
      const room = ctaTop - bodyTop - P(10);
      if (content.body && room > P(24)) {
        drawBodyLines(ctx, content.body, z.x, bodyTop, z.w, Math.max(1, Math.floor(room / (P(15) * 1.6))), {
          size: P(t.type.roles.body.size), min: P(10), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.6, color: C.rgba('#FFFFFF', 0.82), emColor: color.accent,
        });
      }
      drawCta(ctx, content.cta, { x: z.x, y: ctaTop, w: z.w * 0.62, h: plan.zones.cta.h }, {
        body: P(t.type.roles.body.size), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: P(8), style: 'solid',
      });
      drawBadge(ctx, content.badge, { x: W - W * 0.3, y: H * 0.055 }, 'neon', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        ink: '#FFFFFF', family: FONT, bg: color.bg,
      });
      drawFooter(ctx, content, { W, H, margin: plan.zones.text.x, micro: P(9), sub: C.rgba('#FFFFFF', 0.6), family: FONT });
    },

    /* ⑤ 커머스 클린 화이트 */
    'product-stack'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna } = p;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      const ir = plan.zones.image;
      ctx.fillStyle = color.surface;
      ctx.fillRect(ir.x, ir.y, ir.w, ir.h);
      drawPhoto(ctx, img, ir, {
        fallback: 'product', fallbackBg: color.bg, accent: color.accent, ink: color.ink,
        unit: P(8), radius: 0, filter: 'contrast(1.02) saturate(1.04)',
      });
      ctx.strokeStyle = C.rgba(color.ink, 0.08);
      ctx.lineWidth = Math.max(1, P(1));
      ctx.strokeRect(ir.x, ir.y, ir.w, ir.h);

      const z = plan.zones.text;
      const title = fitTitle(ctx, content.title, z.w, 2, {
        size: P(t.type.roles.display.size * 0.9), min: P(24), weight: 800, emWeight: 800,
        family: familyOf(dna, 'display'), lineHeight: 1.24, maxHeight: z.h * 0.56,
      });
      const bodyFit = content.body ? fitBody(ctx, content.body, z.w, 3, {
        size: P(t.type.roles.body.size * 0.94), min: P(9), weight: 400, emWeight: 600,
        family: familyOf(dna, 'body'), lineHeight: 1.55,
      }) : { lines: [], size: P(15) };
      const blockH = title.lines.length * title.lh + (bodyFit.lines.length ? P(8) + bodyFit.lines.length * Math.round(bodyFit.size * 1.55) : 0);
      const yTop = z.y + Math.max(0, (z.h - blockH) * 0.44);
      drawTextBlock(ctx, title.lines, z.x, yTop, title.size, title.lh, {
        weight: 800, emWeight: 800, family: familyOf(dna, 'display'), color: color.ink,
        emColor: color.accent, align: 'left', width: z.w,
      });
      const bodyTop = yTop + title.lines.length * title.lh + P(8);
      if (content.body && bodyFit.lines.length) {
        drawBodyLines(ctx, content.body, z.x, bodyTop, z.w, 3, {
          size: P(t.type.roles.body.size * 0.94), min: P(9), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.55, color: color.sub, emColor: color.ink,
        });
      }
      drawCta(ctx, content.cta, plan.zones.cta, {
        body: P(t.type.roles.body.size), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: P(8), style: 'solid',
      });
      drawBadge(ctx, content.badge, { x: plan.zones.badge.x, y: ir.y + P(12) }, 'solid', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        ink: color.ink, family: FONT, bg: color.bg,
      });
      drawFooter(ctx, content, { W, H, margin: plan.zones.text.x, micro: P(9), sub: color.sub, family: FONT });
    },

    /* ⑥ 네오 브루탈리즘 */
    'brutal-block'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna } = p;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      /* 보이는 8열 격자 */
      ctx.strokeStyle = C.rgba(color.ink, 0.12);
      ctx.lineWidth = Math.max(1, P(1));
      for (let i = 1; i < 8; i++) {
        const x = (W / 8) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const y = (H / 6) * i;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const border = Math.max(2, P(3));
      const shadow = P(6);
      const ir = plan.zones.image;
      ctx.fillStyle = color.ink;
      ctx.fillRect(ir.x + shadow, ir.y + shadow, ir.w, ir.h);
      drawPhoto(ctx, img, ir, {
        fallback: 'brutal', fallbackBg: color.surface, accent: color.accent, ink: color.ink,
        unit: P(8), radius: 0, filter: 'grayscale(1) contrast(1.15)', border,
        borderColor: color.ink,
      });

      const z = plan.zones.text;
      const cardH = z.h + P(22);
      ctx.fillStyle = color.ink;
      ctx.fillRect(z.x + shadow, z.y - P(11) + shadow, z.w, cardH);
      ctx.fillStyle = color.surface;
      ctx.fillRect(z.x, z.y - P(11), z.w, cardH);
      ctx.strokeStyle = color.ink;
      ctx.lineWidth = border;
      ctx.strokeRect(z.x, z.y - P(11), z.w, cardH);

      const innerX = z.x + P(14);
      const innerW = z.w - P(28);
      const title = fitTitle(ctx, content.title, innerW, 2, {
        size: P(t.type.roles.display.size * 0.84), min: P(22), weight: 900, emWeight: 900,
        family: familyOf(dna, 'display'), lineHeight: 1.06, maxHeight: cardH * 0.52,
      });
      drawTextBlock(ctx, title.lines, innerX, z.y, title.size, title.lh, {
        weight: 900, emWeight: 900, family: familyOf(dna, 'display'), color: color.ink,
        emColor: color.accent, align: 'left', width: innerW,
      });
      const bodyTop = z.y + title.lines.length * title.lh + P(6);
      const room = z.y - P(11) + cardH - P(8) - bodyTop;
      if (content.body && room > P(18)) {
        drawBodyLines(ctx, content.body, innerX, bodyTop, innerW, Math.max(1, Math.floor(room / (P(13) * 1.45))), {
          size: P(t.type.roles.body.size * 0.9), min: P(8), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.45, color: color.sub, emColor: color.ink,
        });
      }
      drawCta(ctx, content.cta, plan.zones.cta, {
        body: P(t.type.roles.body.size), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: 0, style: 'block',
        blockColor: color.ink, blockInk: color.accentInk,
      });
      drawBadge(ctx, content.badge, { x: W - W * 0.34, y: H * 0.06 }, 'sticker', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        ink: color.ink, family: FONT, bg: color.bg,
      });
      drawFooter(ctx, content, { W, H, margin: plan.zones.text.x, micro: P(9), sub: color.sub, family: FONT });
    },

    /* ⑦ 미니멀 럭셔리 세리프 */
    'minimal-poster'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna } = p;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = C.rgba(color.ink, 0.1);
      ctx.lineWidth = Math.max(1, P(0.8));
      ctx.strokeRect(W * 0.06, H * 0.045, W * 0.88, H * 0.91);

      const ir = plan.zones.image;
      drawPhoto(ctx, img, ir, {
        fallback: 'editorial', fallbackBg: color.surface, accent: color.accent, ink: color.ink,
        unit: P(8), radius: 0, focal: 'center', filter: 'sepia(0.16) saturate(0.88) contrast(1.02)',
        border: Math.max(1, P(0.8)), borderColor: C.rgba(color.ink, 0.22),
      });

      drawBadge(ctx, content.badge, { x: W / 2, y: H * 0.055 }, 'minimal', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        ink: color.sub, family: FONT, bg: color.bg,
      });

      const z = plan.zones.text;
      const title = fitTitle(ctx, content.title, z.w, 4, {
        size: P(t.type.roles.display.size * 0.96), min: P(22), weight: 400, emWeight: 400,
        family: familyOf(dna, 'display'), lineHeight: 1.34, maxHeight: z.h * 0.62,
      });
      drawTextBlock(ctx, title.lines, z.x, z.y + P(6), title.size, title.lh, {
        weight: 400, emWeight: 500, family: familyOf(dna, 'display'), color: color.ink,
        emColor: color.accent, align: 'center', width: z.w,
      });
      ctx.fillStyle = color.accent;
      const ruleY = z.y + P(6) + title.lines.length * title.lh + P(14);
      ctx.fillRect(W / 2 - P(30), ruleY, P(60), Math.max(1, P(1.2)));

      const bodyTop = regel => regel + P(16);
      const room = plan.zones.cta.y - bodyTop(ruleY) - P(10);
      if (content.body && room > P(20)) {
        drawBodyLines(ctx, content.body, z.x, bodyTop(ruleY), z.w, Math.max(1, Math.floor(room / (P(13) * 1.7))), {
          size: P(t.type.roles.body.size * 0.92), min: P(8), weight: 300, emWeight: 500,
          family: familyOf(dna, 'body'), lineHeight: 1.7, color: color.sub, emColor: color.ink,
          align: 'center',
        });
      }
      drawCta(ctx, content.cta, { x: W / 2 - P(90), y: plan.zones.cta.y, w: P(180), h: plan.zones.cta.h }, {
        body: P(t.type.roles.body.size * 0.86), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: 0, style: 'text',
      });
      drawFooter(ctx, content, { W, H, margin: W * 0.08, micro: P(9), sub: color.sub, family: FONT, alignCenter: true });
    },

    /* ⑧ 비비드 팝 카드 */
    'pop-stack'(ctx, p) {
      const { W, H, P, color, content, img, plan, t, dna, index } = p;
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);

      const ir = plan.zones.image;
      const radius = P(24);
      ctx.save();
      ctx.shadowColor = C.rgba(color.accent, 0.22);
      ctx.shadowBlur = P(30);
      ctx.shadowOffsetY = P(12);
      ctx.fillStyle = color.accentSoft;
      roundRect(ctx, ir.x, ir.y, ir.w, ir.h, radius);
      ctx.fill();
      ctx.restore();
      drawPhoto(ctx, img, ir, {
        fallback: 'pop', fallbackBg: color.accentSoft, accent: color.accent, ink: color.ink,
        unit: P(8), radius, filter: 'saturate(1.06) contrast(1.02)',
      });

      /* 큰 섹션 숫자 스티커 */
      const stickerR = P(44);
      const sx = ir.x + ir.w - stickerR * 0.55;
      const sy = ir.y + ir.h - stickerR * 0.25;
      ctx.fillStyle = color.accent;
      ctx.beginPath();
      ctx.arc(sx, sy, stickerR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color.accentInk;
      setFont(ctx, P(34), 900, familyOf(dna, 'display'));
      ctx.textAlign = 'center';
      ctx.fillText(String(index + 1).padStart(2, '0'), sx, sy + P(12));
      ctx.textAlign = 'left';

      const z = plan.zones.text;
      const title = fitTitle(ctx, content.title, z.w, 3, {
        size: P(t.type.roles.display.size * 0.92), min: P(24), weight: 900, emWeight: 900,
        family: familyOf(dna, 'display'), lineHeight: 1.16, maxHeight: z.h * 0.66,
      });
      drawTextBlock(ctx, title.lines, z.x, z.y, title.size, title.lh, {
        weight: 900, emWeight: 900, family: familyOf(dna, 'display'), color: color.ink,
        emColor: color.accent, align: 'left', width: z.w,
      });
      const bodyTop = z.y + title.lines.length * title.lh + P(8);
      const room = plan.zones.cta.y - bodyTop - P(8);
      if (content.body && room > P(18)) {
        drawBodyLines(ctx, content.body, z.x, bodyTop, z.w, Math.max(1, Math.floor(room / (P(13) * 1.55))), {
          size: P(t.type.roles.body.size * 0.92), min: P(8), weight: 400, emWeight: 600,
          family: familyOf(dna, 'body'), lineHeight: 1.55, color: color.sub, emColor: color.ink,
        });
      }
      drawCta(ctx, content.cta, plan.zones.cta, {
        body: P(t.type.roles.body.size), family: FONT, accent: color.accent,
        accentInk: color.accentInk, radius: '999', style: 'solid',
      });
      drawBadge(ctx, content.badge, { x: W * 0.06, y: H * 0.055 }, 'pill-solid', {
        micro: P(t.type.roles.micro.size), W, accent: color.accent, accentInk: color.accentInk,
        ink: color.ink, family: FONT, bg: color.bg,
      });
      drawFooter(ctx, content, { W, H, margin: W * 0.06, micro: P(9), sub: color.sub, family: FONT });
    },
  };

  /* ── 진입점 ────────────────────────────────────────────── */
  function draw(target, project, index, opts) {
    const o = opts || {};
    const DR = window.DesignRef;
    const design = (project && project.design) || {};
    const preset = C.stylePreset(design.presetId);
    if (!DR || !preset) return false;

    const R = C.ratioById(project.ratio);
    const W = R.w, H = R.h;
    const scale = o.scale || 1;
    target.width = Math.max(2, Math.round(W * scale));
    target.height = Math.max(2, Math.round(H * scale));
    const ctx = target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.scale(scale, scale);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const t = DR.tokens(preset);
    const dna = DR.dnaOf(preset);
    const plan = DR.layoutPlan(preset, { width: W, height: H });
    const s = W / 540;
    const P = v => Math.round(v * s * 10) / 10;

    /* 추출 팔레트가 있으면 프리셋의 구조·타이포는 두고 색만 바꾼다 */
    const custom = project.customTheme && C.themeFromPalette(project.customTheme.palette, project.customTheme.name);
    const color = custom ? {
      bg: custom.bg, surface: custom.panel, ink: custom.ink, sub: custom.inkSoft,
      line: custom.line, accent: custom.accent, accentSoft: C.mixHex(custom.accent, custom.bg, 0.86),
      accentInk: C.contrastRatio(custom.bg, custom.accent) > 3.2 ? custom.bg : '#FFFFFF',
    } : t.color;

    const content = C.presetContent(project, index);
    const safety = content.photo ? DR.imageTextSafety(preset) : null;

    const params = {
      W, H, P, s, color, content, dna, plan, t, index,
      img: o.imageEl || null, safety,
    };

    const fn = STRUCTURES[plan.structure] || STRUCTURES['swiss-grid'];
    ctx.save();
    try {
      fn(ctx, params);
    } catch (err) {
      /* 구조 렌더 실패 시에도 흰 화면을 남기지 않는다 */
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);
      setFont(ctx, P(24), 700, FONT);
      ctx.fillStyle = color.ink;
      ctx.fillText('카드를 그리지 못했습니다', P(40), P(80));
    }
    ctx.restore();
    return true;
  }

  window.StudioPreset = { draw, wrapWords, fitTitle, drawFallback, VERSION: '1.2.0' };
})();
