/* ============================================================
   카드뉴스·대본 스튜디오 · core.js
   Pure, DOM-free logic — rendered by app.js, unit-tested by test.js.
     · ratios / themes / sample project
     · **강조** run parsing, line layout
     · 글 → 카드뉴스 자동 분할
     · 30초 숏폼 대본 · 자막(.srt)
     · 최소 ZIP writer (무압축, CRC-32)
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── ratios ─────────────────────────────────────────────── */
  const RATIOS = [
    { id: '4x5', label: '4:5 스레드·인스타', short: '4:5', w: 1080, h: 1350, hint: '피드에서 가장 크게 보이는 비율' },
    { id: '1x1', label: '1:1 정사각', short: '1:1', w: 1080, h: 1080, hint: '프로필·썸네일 겸용' },
    { id: '9x16', label: '9:16 릴스·스토리', short: '9:16', w: 1080, h: 1920, hint: '풀스크린 세로' },
  ];

  /* ── themes ─────────────────────────────────────────────── */
  const THEMES = [
    {
      id: 'white-card', name: '화이트 카드', desc: '리서치·비교표형',
      bg: '#ffffff', bgTo: '#eef2fa', ink: '#101623', inkSoft: '#46506a',
      accent: '#1f5fe0', line: '#dde3ef', badgeBg: '#101623', badgeInk: '#ffffff',
      emStyle: 'highlight', decor: 'grid', panel: '#f4f7fd',
    },
    {
      id: 'dark-impact', name: '다크 임팩트', desc: '강한 대비·숫자 강조',
      bg: '#0a0b10', bgTo: '#151827', ink: '#ffffff', inkSoft: '#b9c1d4',
      accent: '#d6ff3f', line: '#2a2f42', badgeBg: '#d6ff3f', badgeInk: '#0a0b10',
      emStyle: 'marker', decor: 'glow', panel: '#12141d',
    },
    {
      id: 'cream-editorial', name: '크림 에디토리얼', desc: '매거진·칼럼형',
      bg: '#f7efe0', bgTo: '#efe2cc', ink: '#26201a', inkSoft: '#5a4d40',
      accent: '#a4552a', line: '#ddcdb2', badgeBg: '#26201a', badgeInk: '#f7efe0',
      emStyle: 'highlight', decor: 'rules', panel: '#fbf5ea',
    },
    {
      id: 'coral-red', name: '코랄 레드', desc: '이벤트·후킹형',
      bg: '#d92a20', bgTo: '#ff6a4a', ink: '#ffffff', inkSoft: '#ffe2dc',
      accent: '#ffd166', line: '#ffffff', badgeBg: '#ffffff', badgeInk: '#d92a20',
      emStyle: 'marker', decor: 'blob', panel: '#c8231a',
    },
    {
      id: 'deep-navy', name: '딥 네이비', desc: 'B2B·리포트형',
      bg: '#0c1730', bgTo: '#17244c', ink: '#eef3ff', inkSoft: '#a9b6d6',
      accent: '#ffcb5c', line: '#1e2b4d', badgeBg: '#ffcb5c', badgeInk: '#0c1730',
      emStyle: 'marker', decor: 'arcs', panel: '#111d3a',
    },
    {
      id: 'mint-report', name: '민트 리포트', desc: '데이터·체크리스트형',
      bg: '#eefaf4', bgTo: '#d6f1e6', ink: '#0c2a22', inkSoft: '#3f6258',
      accent: '#0e9c72', line: '#c3e6d8', badgeBg: '#0c2a22', badgeInk: '#eefaf4',
      emStyle: 'highlight', decor: 'bars', panel: '#f6fdfa',
    },
  ];

  const KIND_LABEL = { cover: '표지', body: '본문', cta: '마무리' };
  const MAX_BODY_SLIDES = 6;
  const MAX_SLIDES = 8; // 표지 1 + 본문 6 + 마무리 1

  /* ── sample (전부 가상의 일반 예시 · 개인정보 없음) ────────── */
  const SAMPLE_PROJECT = {
    ratio: '4x5',
    theme: 'white-card',
    handle: '@your.handle',
    badge: 'CARD NEWS',
    showBadge: true,
    showHandle: true,
    showPage: true,
    slides: [
      { id: 's1', kind: 'cover', badge: 'CARD NEWS', title: '카드뉴스, **4장**이면 충분합니다', body: '길게 쓰면 안 읽힙니다.\n한 장에 한 가지만 담으세요.' },
      { id: 's2', kind: 'body', badge: '', title: '첫 장에서 **결정**됩니다', body: '표지는 결론을 먼저 던집니다.\n스크롤을 멈추는 시간은 **1.5초**.' },
      { id: 's3', kind: 'body', badge: '', title: '본문은 근거만', body: '숫자 하나, 비교 하나, 사례 하나.\n나머지는 과감히 지웁니다.' },
      { id: 's4', kind: 'cta', badge: '', title: '오늘 **한 장**만 만들어보세요', body: '저장해두고 템플릿으로 쓰세요.\n다음 카드에서 또 만나요.' },
    ],
  };

  const SAMPLE_SCRIPT = {
    topic: '전기요금 아끼는 법',
    target: '1인 가구',
    points: ['대기전력만 잡아도 5% 차이', '에어컨 필터는 2주마다 청소', '누진구간 확인은 요금표에서'],
    hook: 'shock',
  };

  /* ── tiny utils ─────────────────────────────────────────── */
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function ratioById(id) { return RATIOS.find(r => r.id === id) || RATIOS[0]; }
  function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const int = parseInt(full.slice(0, 6), 16);
    if (!isFinite(int)) return { r: 0, g: 0, b: 0 };
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
  }

  function luminance(hex) {
    const c = hexToRgb(hex);
    const f = v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function contrastRatio(a, b) {
    const l1 = luminance(a), l2 = luminance(b);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ── emphasis parsing ───────────────────────────────────── */
  function normalizeEmphasisTags(text) {
    return String(text == null ? '' : text)
      .replace(/<\/?(?:em|mark|b|strong)>/gi, m => (/^<\//.test(m) ? '**' : '**'));
  }

  /** '**핵심어**' → [{text:'핵심어', em:true}] · 짝이 없는 ** 는 글자로 둔다. */
  function parseRuns(text) {
    const s = normalizeEmphasisTags(text);
    const out = [];
    let buf = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '*' && s[i + 1] === '*') {
        const close = s.indexOf('**', i + 2);
        if (close > -1) {
          if (buf) { out.push({ text: buf, em: false }); buf = ''; }
          const inner = s.slice(i + 2, close);
          if (inner) out.push({ text: inner, em: true });
          i = close + 2;
          continue;
        }
        buf += '**';
        i += 2;
        continue;
      }
      buf += s[i];
      i += 1;
    }
    if (buf) out.push({ text: buf, em: false });
    return out.length ? out : [{ text: '', em: false }];
  }

  function stripEmphasis(text) {
    return parseRuns(text).map(r => r.text).join('');
  }

  function hasEmphasis(text) {
    return parseRuns(text).some(r => r.em);
  }

  /* ── line layout (measure callback is supplied by the caller) ── */
  /**
   * layoutRuns(runs, maxWidth, measure) → lines, each an array of
   * {ch, em} tokens. Breaks at the last space when possible, else hard-breaks.
   */
  function layoutRuns(runs, maxWidth, measure) {
    const tokens = [];
    runs.forEach(run => {
      Array.from(run.text).forEach(ch => {
        tokens.push({ ch, em: !!run.em, w: measure(ch, run) });
      });
    });
    const lines = [];
    let line = [];
    let width = 0;
    let lastSpace = -1;

    const flush = () => { lines.push(line); line = []; width = 0; lastSpace = -1; };

    for (const t of tokens) {
      if (t.ch === '\n') { flush(); continue; }
      if (width + t.w > maxWidth && line.length) {
        let breakAt = lastSpace > 0 ? lastSpace : line.length;
        const head = line.slice(0, breakAt);
        let tail = line.slice(breakAt);
        if (breakAt === lastSpace && tail.length && tail[0].ch === ' ') tail = tail.slice(1);
        lines.push(head);
        line = tail;
        width = line.reduce((s, x) => s + x.w, 0);
        lastSpace = -1;
        line.forEach((x, i) => { if (x.ch === ' ') lastSpace = i; });
      }
      line.push(t);
      width += t.w;
      if (t.ch === ' ') lastSpace = line.length - 1;
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function lineToRuns(line) {
    const out = [];
    line.forEach(t => {
      const last = out[out.length - 1];
      if (last && last.em === t.em) last.text += t.ch;
      else out.push({ text: t.ch, em: t.em });
    });
    // trim trailing spaces, drop empty runs
    return out
      .map(r => ({ text: r.em ? r.text : r.text.replace(/\s+$/, ''), em: r.em }))
      .filter(r => r.text.length > 0);
  }

  function lineText(line) { return line.map(t => t.ch).join('').replace(/\s+$/, ''); }

  /* ── text helpers ───────────────────────────────────────── */
  function cleanText(text) {
    return String(text == null ? '' : text).replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  }

  function charCount(text) {
    return stripEmphasis(cleanText(text)).replace(/\s/g, '').length;
  }

  /** 글자 수 기준 자르기 — 공백/구두점 경계에서 끊고 … 를 붙인다. */
  function truncateAt(text, max, ellipsis) {
    const s = cleanText(text);
    if (s.length <= max) return s;
    const window = s.slice(0, Math.max(1, max));
    const cut = Math.max(
      window.lastIndexOf(' '),
      Math.max(window.lastIndexOf(','), Math.max(window.lastIndexOf('·'), window.lastIndexOf('—')))
    );
    const body = cut >= Math.floor(max * 0.5) ? window.slice(0, cut) : window;
    return body.replace(/[\s,·—]+$/, '') + (ellipsis === false ? '' : '…');
  }

  /** 15자 이내 줄바꿈 (한국어 자막용). */
  function wrapChars(text, max) {
    const s = cleanText(stripEmphasis(text)).replace(/\s+/g, ' ');
    if (!s) return [];
    const out = [];
    let rest = s;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < Math.floor(max * 0.55)) cut = max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out.filter(Boolean);
  }

  /** 받침 유무로 조사를 고른다. josa('1인 가구', '이/가') → '가' */
  function josa(word, pair) {
    const w = cleanText(word).replace(/[)\]"'”’…]+$/, '');
    const last = w.charAt(w.length - 1);
    const code = last.charCodeAt(0);
    const isHangul = code >= 0xAC00 && code <= 0xD7A3;
    const hasBatchim = isHangul ? (code - 0xAC00) % 28 !== 0 : /[0-9]/.test(last);
    const [withB, withoutB] = String(pair || '이/가').split('/');
    return hasBatchim ? withB : withoutB;
  }

  const NUM_RE = /(\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|배|만|억|원|명|시간|분|초|개월|개|년|주|달|일|kg|km|위|가지|장|컷)?)/;

  function extractNumber(text) {
    const m = String(text == null ? '' : text).match(NUM_RE);
    return m ? m[0].trim() : null;
  }

  /** 카드에서 가장 먼저 나오는 숫자 하나를 **강조**로 감싼다. */
  function emphasizeFirstNumber(text) {
    const raw = String(text == null ? '' : text);
    if (hasEmphasis(raw)) return raw;
    const m = raw.match(NUM_RE);
    if (!m || !m[0]) return raw;
    const start = m.index;
    const value = m[0].trimEnd();
    const end = start + value.length;
    return raw.slice(0, start) + '**' + value + '**' + raw.slice(end);
  }

  /* ── 글 → 카드뉴스 자동 분할 ────────────────────────────── */
  function splitSentences(text) {
    const s = cleanText(text);
    if (!s) return [];
    const sentences = [];
    s.split(/(?<=[.!?。！？])\s+|\n+/).forEach(part => {
      const p = part.trim();
      if (!p) return;
      // 아주 긴 문장은 쉼표에서 한 번 더 끊는다
      if (p.length > 90) {
        let rest = p;
        while (rest.length > 90) {
          const cut = rest.lastIndexOf(',', 80);
          if (cut < 30) break;
          sentences.push(rest.slice(0, cut + 1).trim());
          rest = rest.slice(cut + 1).trim();
        }
        if (rest) sentences.push(rest);
      } else {
        sentences.push(p);
      }
    });
    return sentences.filter(Boolean);
  }

  const CTA_LIBRARY = [
    { title: '저장해두고 **하나씩**', body: '나중에 다시 볼 카드로 저장해두세요.\n궁금한 건 댓글로 남겨주세요.' },
    { title: '오늘 **하나만** 바꿔보세요', body: '거창하게 시작하지 않아도 됩니다.\n내일 아침에 하나만 적용해 보세요.' },
    { title: '다음 편에서 **더 깊게**', body: '팔로우해두면 이어지는 내용을 놓치지 않습니다.\n공유는 큰 힘이 됩니다.' },
    { title: '**체크리스트**로 저장', body: '이 카드 저장 → 오늘 바로 체크.\n어려운 부분은 댓글로 알려주세요.' },
    { title: '같이 **정리해요**', body: '혼자 고민하지 말고 저장해두고 하나씩.\n다음 카드에서 또 만나요.' },
  ];

  function hashStr(str) {
    let h = 2166136261;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function pickCta(seed) {
    return CTA_LIBRARY[hashStr(seed) % CTA_LIBRARY.length];
  }

  /**
   * splitTextIntoSlides(text, opts) → { cover, bodies[], cta }
   * opts.bodyTarget(2~6) · opts.badge · opts.handle
   */
  function splitTextIntoSlides(text, opts) {
    const o = opts || {};
    const sentences = splitSentences(text);
    if (!sentences.length) {
      return { cover: null, bodies: [], cta: null, empty: true };
    }
    const bodyTarget = clamp(parseInt(o.bodyTarget, 10) || 4, 1, MAX_BODY_SLIDES);

    // 표지 제목 1문장(+부제 1문장), 나머지를 본문 그룹으로 나눈다
    const first = sentences[0];
    const rest = sentences.slice(1);
    const headlineMax = 34;
    const coverTitle = emphasizeFirstNumber(first.length > 46 ? truncateAt(first, 46) : first);
    const coverBody = rest.length >= 2 && rest[0].length <= 60 ? rest[0] : '';
    const bodySentences = rest.slice(coverBody ? 1 : 0);

    if (!bodySentences.length) {
      const cta0 = pickCta(coverTitle);
      return {
        cover: { kind: 'cover', badge: o.badge || 'CARD NEWS', title: coverTitle, body: coverBody },
        bodies: [],
        cta: { kind: 'cta', badge: '', title: cta0.title, body: cta0.body },
        keyword: truncateAt(stripEmphasis(coverTitle), 16, false),
        empty: false,
      };
    }

    const desired = Math.min(bodyTarget, bodySentences.length, MAX_BODY_SLIDES);
    const GROUP_MAX = 140;
    const count = Math.max(1, Math.min(desired, bodySentences.length));
    const cum = [];
    let running = 0;
    bodySentences.forEach(s => { running += s.length + 1; cum.push(running); });
    const totalLen = running;
    const groups = [];
    let cur = [];
    let curLen = 0;
    bodySentences.forEach((sentence, i) => {
      cur.push(sentence);
      curLen += sentence.length + 1;
      const sentencesLeft = bodySentences.length - i - 1;
      const groupsLeft = count - groups.length - 1;
      const cutPoint = (totalLen * (groups.length + 1)) / count;
      const balanced = cum[i] >= cutPoint - 1 && sentencesLeft >= groupsLeft;
      const tooLong = curLen >= GROUP_MAX && sentencesLeft >= 1 && groups.length < MAX_BODY_SLIDES - 1;
      if (groupsLeft > 0 && sentencesLeft > 0 && (balanced || tooLong)) {
        groups.push(cur);
        cur = [];
        curLen = 0;
      }
    });
    if (cur.length) groups.push(cur);

    const bodies = groups.map(group => {
      const list = group.slice();
      const s0 = list[0];
      let title, tail;
      if (s0.length <= headlineMax) {
        title = s0;
        tail = list.slice(1);
      } else {
        const cut = (() => {
          const window = s0.slice(0, headlineMax);
          const c = window.lastIndexOf(' ');
          return c >= 10 ? c : headlineMax;
        })();
        title = s0.slice(0, cut).replace(/[\s,]+$/, '');
        tail = [s0.slice(cut).trim()].concat(list.slice(1)).filter(Boolean);
      }
      const body = tail.join(' ').trim();
      return {
        kind: 'body',
        badge: '',
        title: emphasizeFirstNumber(title),
        body: body ? emphasizeFirstNumber(body) : '',
      };
    });

    const cta = pickCta(coverTitle);
    const keyword = truncateAt(stripEmphasis(coverTitle), 16, false);

    return {
      cover: {
        kind: 'cover',
        badge: o.badge || 'CARD NEWS',
        title: coverTitle,
        body: coverBody,
      },
      bodies,
      cta: {
        kind: 'cta',
        badge: '',
        title: cta.title,
        body: cta.body,
      },
      keyword,
      empty: false,
    };
  }

  /* ── 30초 숏폼 대본 ─────────────────────────────────────── */
  const HOOK_TYPES = [
    { id: 'shock', label: '충격숫자', desc: '숫자 하나로 멈추게', example: '“5% 차이입니다.”' },
    { id: 'loss', label: '손해회피', desc: '안 하면 손해', example: '“모르면 계속 손해.”' },
    { id: 'compare', label: '직접비교', desc: 'A vs B로 갈라보기', example: '“뭐가 다를까요?”' },
    { id: 'story', label: '경험썰', desc: '내가 겪은 일부터', example: '“저도 몰랐습니다.”' },
  ];

  const BEATS = [
    { id: 'hook', start: 0, end: 3, label: '훅', hint: '스크롤을 멈추는 한 문장' },
    { id: 'problem', start: 3, end: 12, label: '문제·전개', hint: '누구의 어떤 문제인지' },
    { id: 'proof', start: 12, end: 25, label: '증거·반전', hint: '근거 → 반전' },
    { id: 'cta', start: 25, end: 30, label: 'CTA', hint: '저장·팔로우 한 가지' },
  ];

  const SPEECH_CHARS_PER_SEC = 5.5;

  function speakBudget(seconds) {
    return Math.round(seconds * SPEECH_CHARS_PER_SEC);
  }

  function clipText(text, n) {
    return truncateAt(stripEmphasis(text), n);
  }

  function buildScript(input) {
    const inp = input || {};
    const fw = inp.framework && Array.isArray(inp.framework.sections) && inp.framework.sections.length ? inp.framework : null;
    if (Array.isArray(inp.beats) && inp.beats.length) {
      const aiBeats = BEATS.map((b, i) => {
        const src = inp.beats[i] || {};
        const narration = cleanText(src.narration).replace(/\*\*/g, '');
        const budget = speakBudget(b.end - b.start);
        return {
          id: b.id, label: b.label, hint: b.hint, start: b.start, end: b.end,
          narration,
          screen: (Array.isArray(src.screen) ? src.screen : []).map(x => cleanText(x)).filter(Boolean).slice(0, 2),
          chars: charCount(narration),
          budget,
          over: charCount(narration) > budget,
        };
      }).filter(b => b.narration);
      if (aiBeats.length >= 3) {
        const pts = (inp.points || []).map(p => cleanText(p)).filter(Boolean).slice(0, 3);
        while (pts.length < 3) pts.push('');
        return {
          hook: HOOK_TYPES.some(h => h.id === inp.hook) ? inp.hook : 'loss',
          topic: cleanText(inp.topic) || '이 주제',
          target: cleanText(inp.target) || '처음 보는 사람',
          points: pts,
          bridgeBeats: true,
          beats: aiBeats,
          subtitles: buildSubtitles(aiBeats),
        };
      }
    }
    if (fw) {
      const fwBeats = beatsFromFramework(fw);
      const fwPoints = (inp.points || []).map(p => cleanText(p)).filter(Boolean).slice(0, 3);
      while (fwPoints.length < 3) fwPoints.push('');
      return {
        hook: HOOK_TYPES.some(h => h.id === inp.hook) ? inp.hook : 'loss',
        topic: cleanText(inp.topic) || cleanText(fw.title) || '이 주제',
        target: cleanText(inp.target) || '처음 보는 사람',
        points: fwPoints,
        framework: { id: String(fw.id || ''), name: String(fw.name || ''), title: String(fw.title || '') },
        beats: fwBeats,
        subtitles: buildSubtitles(fwBeats),
      };
    }
    const topic = cleanText(inp.topic) || '이 주제';
    const target = cleanText(inp.target) || '처음 시작하는 사람';
    const rawPoints = (inp.points || []).map(p => cleanText(p)).filter(Boolean);
    const points = rawPoints.slice(0, 3);
    while (points.length < 3) points.push('');
    const hookId = HOOK_TYPES.some(h => h.id === inp.hook) ? inp.hook : 'shock';
    const num = extractNumber(points.join(' ')) || '[숫자]';
    const shortTopic = clipText(topic, 10);
    const p1 = points[0] ? clipText(points[0], 18) : '첫 단계';
    const p2 = points[1] ? clipText(points[1], 20) : '가장 많이 놓치는 부분';
    const p3 = points[2] ? clipText(points[2], 20) : '순서를 바꾸는 것';

    const hooks = {
      shock: {
        narration: `${shortTopic}, ${num} 차이입니다.`,
        screen: [num + ' 차이', shortTopic],
      },
      loss: {
        narration: `${num} 모르면 계속 손해입니다.`,
        screen: ['이대로 두면', '계속 손해입니다'],
      },
      compare: {
        narration: `${shortTopic}, 뭐가 다를까요?`,
        screen: ['뭐가 다를까', shortTopic],
      },
      story: {
        narration: `${shortTopic}, 저도 몰랐죠.`,
        screen: ['저도 몰랐습니다', shortTopic],
      },
    };

    const content = {
      hook: hooks[hookId],
      problem: {
        narration: `${clipText(target, 10)}${josa(clipText(target, 10), '이/가')} 가장 먼저 막히는 건 ${p1}. 여기서 갈립니다.`,
        screen: [p1, '여기서 갈립니다'],
      },
      proof: {
        narration: `${p2}. 여기서 반전, ${p3}. 순서만 바꾸면 결과가 달라집니다.`,
        screen: [p2, p3],
      },
      cta: {
        narration: `${clipText(shortTopic, 10)} 저장해두고 하나씩 해보세요.`,
        screen: ['저장해두기', '하나씩 해보기'],
      },
    };

    const beats = BEATS.map(b => {
      const c = content[b.id];
      const narration = cleanText(c.narration).replace(/\*\*/g, '');
      const budget = speakBudget(b.end - b.start);
      return {
        id: b.id,
        label: b.label,
        hint: b.hint,
        start: b.start,
        end: b.end,
        narration,
        screen: c.screen.map(s => cleanText(s)).filter(Boolean).slice(0, 2),
        chars: charCount(narration),
        budget,
        over: charCount(narration) > budget,
      };
    });

    return {
      hook: hookId,
      topic,
      target,
      points,
      beats,
      subtitles: buildSubtitles(beats),
    };
  }

  function buildSubtitles(beats) {
    const out = [];
    let index = 0;
    (beats || []).forEach(beat => {
      const lines = wrapChars(beat.narration, 15);
      if (!lines.length) return;
      const chunks = [];
      for (let i = 0; i < lines.length; i += 2) chunks.push(lines.slice(i, i + 2));
      const weights = chunks.map(c => charCount(c.join('')) || 1);
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      const span = Math.max(1, beat.end - beat.start);
      let acc = 0;
      let prevEnd = beat.start;
      chunks.forEach((chunk, i) => {
        acc += weights[i];
        const end = i === chunks.length - 1 ? beat.end : beat.start + (span * acc) / total;
        const start = prevEnd;
        const safeEnd = Math.max(end, start + 0.2);
        index += 1;
        out.push({ index, start, end: Math.min(safeEnd, beat.end), text: chunk.join('\n') });
        prevEnd = Math.min(safeEnd, beat.end);
      });
    });
    return out;
  }

  function formatTimecode(seconds) {
    const total = Math.max(0, seconds || 0);
    const ms = Math.round(total * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const milli = ms % 1000;
    const pad = (n, w) => String(n).padStart(w, '0');
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(milli, 3)}`;
  }

  function toSrt(subs) {
    return (subs || []).map((s, i) => {
      const idx = s.index || i + 1;
      const body = String(s.text || '')
        .split('\n')
        .map(line => cleanText(line).slice(0, 15))
        .filter(Boolean)
        .join('\n');
      return `${idx}\n${formatTimecode(s.start)} --> ${formatTimecode(s.end)}\n${body}\n`;
    }).join('\n');
  }

  function scriptToText(script) {
    const head = `주제: ${script.topic}\n타겟: ${script.target}\n훅 패턴: ${(HOOK_TYPES.find(h => h.id === script.hook) || HOOK_TYPES[0]).label}\n`;
    const body = script.beats.map(b => `\n[${b.start}~${b.end}초 · ${b.label}]\n${b.narration}\n(화면 자막) ${b.screen.join(' / ')}`).join('\n');
    return head + body + '\n';
  }

  function buildAiPrompt(input, script) {
    const inp = input || {};
    const labels = HOOK_TYPES.find(h => h.id === (script ? script.hook : inp.hook)) || HOOK_TYPES[0];
    const points = (inp.points || []).filter(Boolean).map((p, i) => `${i + 1}. ${p}`).join('\n') || '1. (핵심 포인트 1)\n2. (핵심 포인트 2)\n3. (핵심 포인트 3)';
    return [
      '[역할]',
      '한국어 숏폼 30초 대본 작가. 아래 뼈대를 살려서 다시 써라.',
      '',
      '[입력]',
      `주제: ${cleanText(inp.topic) || '(주제)'}`,
      `타겟: ${cleanText(inp.target) || '(타겟)'}`,
      `핵심 포인트:\n${points}`,
      `훅 패턴: ${labels.label} (${labels.desc})`,
      '',
      '[구조]',
      script ? script.beats.map(b => `${b.start}~${b.end}초 ${b.label}: ${b.narration}`).join('\n') : '0~3초 훅 / 3~12초 문제·전개 / 12~25초 증거·반전 / 25~30초 CTA',
      '',
      '[규칙]',
      '1. 말할 때 쓰는 구어체. 번역체·요약체·AI 티 나는 상투어 금지.',
      '2. 한 문장은 15자 안팎, 한 호흡에 읽히게.',
      '3. 숫자는 내가 준 값만 쓴다. 없는 수치는 [숫자]로 남겨라.',
      '4. 화면 자막은 한 줄 15자 이내, 최대 2줄.',
      '5. CTA는 저장 또는 팔로우 중 하나만.',
      '',
      '[출력]',
      '0~3 / 3~12 / 12~25 / 25~30초 네 구간으로 나눠서',
      '①말할 대본 ②화면 자막 ③촬영 메모(샷·자막 위치) 순서로 써라.',
    ].join('\n');
  }

  /* ── 카피 프레임워크 → 30초 대본 비트 ──────────────────────
     PAS/BAB/AIDA/4U 결과를 그대로 4구간에 얹는다. */
  function beatsFromFramework(fw) {
    const sec = (fw && fw.sections) || [];
    const oneLine = t => stripEmphasis(cleanText(t)).replace(/\n+/g, ' ');
    const text = i => oneLine((sec[i] || {}).text || '');
    const title = oneLine((fw && fw.title) || '');
    const hookLine = truncateAt(title, 26) || '이 차이, 알고 계셨나요?';
    const problemLine = truncateAt(text(0), 42) || '지금 방식으로는 해결되지 않습니다.';
    const proofParts = [text(1), text(2)].filter(Boolean).map(t => truncateAt(t, 30));
    const proofLine = proofParts.join(' ') || truncateAt(text(1), 56) || '근거는 하나면 충분합니다.';
    const ctaLine = truncateAt(text(sec.length - 1), 24) || '저장해두고 하나씩 해보세요.';

    const content = {
      hook: { narration: hookLine, screen: [truncateAt(title, 12), truncateAt(hookLine, 12)] },
      problem: { narration: problemLine, screen: [(sec[0] || {}).label || '문제', truncateAt(problemLine, 12)] },
      proof: { narration: proofLine, screen: [(sec[1] || {}).label || '근거', truncateAt(proofParts[0] || proofLine, 12)] },
      cta: { narration: ctaLine, screen: [(sec[sec.length - 1] || {}).label || '저장', truncateAt(ctaLine, 12)] },
    };

    return BEATS.map(b => {
      const c = content[b.id];
      const narration = cleanText(c.narration).replace(/\*\*/g, '');
      const budget = speakBudget(b.end - b.start);
      return {
        id: b.id, label: b.label, hint: b.hint, start: b.start, end: b.end,
        narration,
        screen: c.screen.map(s => cleanText(s)).filter(Boolean).slice(0, 2),
        chars: charCount(narration),
        budget,
        over: charCount(narration) > budget,
      };
    });
  }

  /* ── ZIP writer (무압축 · CRC-32) ───────────────────────── */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(data);
      const arr = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i) & 0xFF;
      return arr;
    }
    return new Uint8Array(data || []);
  }

  /** files: [{name, data}] → Uint8Array (store method, UTF-8 names) */
  function buildZip(files, opts) {
    const list = (files || []).map(f => ({ name: String(f.name), bytes: toBytes(f.data) }));
    if (!list.length) throw new Error('no files');
    const DOS_TIME = 0; // 00:00:00
    const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
    const chunks = [];
    const central = [];
    let offset = 0;

    list.forEach(f => {
      const nameBytes = toBytes(f.name);
      const crc = crc32(f.bytes);
      const size = f.bytes.length;

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, DOS_TIME, true);
      lv.setUint16(12, DOS_DATE, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, f.bytes);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, DOS_TIME, true);
      cv.setUint16(14, DOS_DATE, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + size;
    });

    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, list.length, true);
    ev.setUint16(10, list.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const total = offset + cdSize + end.length;
    const out = new Uint8Array(total);
    let p = 0;
    chunks.forEach(c => { out.set(c, p); p += c.length; });
    central.forEach(c => { out.set(c, p); p += c.length; });
    out.set(end, p);
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     엔진 연동 — 카피 심리학(packages/copy-psych-engine.js)과
     핀터레스트 디자인(packages/design-ref-engine.js)을 이 앱의
     데이터 모델에 맞게 감싼다. 엔진 자체는 engines/ 폴더 사본.
     ══════════════════════════════════════════════════════════ */
  function loadEngines() {
    const out = { CopyPsych: null, DesignRef: null };
    if (typeof require === 'function') {
      try { out.CopyPsych = require('./engines/copy-psych-engine.js'); } catch (e) { /* 브라우저 */ }
      try { out.DesignRef = require('./engines/design-ref-engine.js'); } catch (e) { /* 브라우저 */ }
    }
    const g = typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (!out.CopyPsych && g.CopyPsych) out.CopyPsych = g.CopyPsych;
    if (!out.DesignRef && g.DesignRef) out.DesignRef = g.DesignRef;
    return out;
  }
  const ENGINES = loadEngines();

  function enginesReady() {
    return {
      copy: !!(ENGINES.CopyPsych && typeof ENGINES.CopyPsych.diagnose === 'function'),
      design: !!(ENGINES.DesignRef && typeof ENGINES.DesignRef.recommendDesignRefs === 'function'),
      copyVersion: ENGINES.CopyPsych ? ENGINES.CopyPsych.VERSION : null,
      designVersion: ENGINES.DesignRef ? ENGINES.DesignRef.VERSION : null,
    };
  }

  function isHexColor(v) {
    return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
  }

  function mixHex(a, b, t) {
    if (!isHexColor(a) || !isHexColor(b)) return a;
    const x = hexToRgb(a), y = hexToRgb(b);
    const k = clamp(typeof t === 'number' ? t : 0.5, 0, 1);
    const h = v => Math.round(v).toString(16).padStart(2, '0');
    return '#' + h(x.r + (y.r - x.r) * k) + h(x.g + (y.g - x.g) * k) + h(x.b + (y.b - x.b) * k);
  }

  /** 프로젝트의 모든 글(제목·본문·대본 입력)을 한 덩어리로 */
  function projectText(project, script) {
    const p = project || {};
    const parts = (p.slides || []).map(s => {
      const title = stripEmphasis(cleanText(s && s.title));
      const body = stripEmphasis(cleanText(s && s.body));
      return [title, body].filter(Boolean).join(' ');
    });
    if (script) {
      parts.push([cleanText(script.topic), cleanText(script.target), (script.points || []).map(p2 => cleanText(p2)).join(' ')].filter(Boolean).join(' '));
    }
    return cleanText(parts.filter(Boolean).join(' '));
  }

  /** 8대 트리거 진단 + 감점 표현 → 화면 요약(점수·등급·개선안) */
  function analyzeCopy(text) {
    const CP = ENGINES.CopyPsych;
    const t = cleanText(text);
    if (!CP) return { ok: false, reason: 'copy-engine-missing', text: t, chars: charCount(t) };
    const d = CP.diagnose(t);
    const det = CP.detect(t);
    return {
      ok: true,
      text: t,
      chars: d.stats.chars,
      empty: d.flags.empty,
      psych: {
        total: d.total,
        grade: { id: d.grade.id, label: d.grade.label, title: d.grade.title, desc: d.grade.desc, tone: d.grade.tone },
        triggers: d.triggers.map(tr => ({
          id: tr.id, name: tr.name, weight: tr.weight, score: tr.score, level: tr.level,
          hits: (tr.hits || []).slice(0, 3), fix: tr.fix,
        })),
        recommendations: d.recommendations.map(r => ({
          rank: r.rank, trigger: r.trigger, name: r.name, current: r.current,
          target: r.target, impact: r.impact, action: r.action,
        })),
        stats: d.stats,
      },
      friction: {
        score: det.friction,
        grade: { id: det.grade.id, label: det.grade.label, desc: det.grade.desc, tone: det.grade.tone },
        count: det.count,
        groups: det.groups,
        issues: det.issues.slice(0, 8).map(i => ({
          type: i.type, typeLabel: i.typeLabel, phrase: i.phrase, reason: i.reason,
          alternative: i.alternative, example: i.example, canAutoFix: i.canAutoFix, severity: i.severity,
        })),
      },
    };
  }

  /**
   * 추상어·공급자어·번역체 자동 교정.
   * 엔진의 치환 중 문장을 통째로 CTA로 바꾸는 제안(예: "저희는 제공합니다" →
   * "지금 바로 받아보세요")은 사용자의 문장을 없애므로 자동 적용하지 않고
   * 제안으로만 돌려준다. 문장 단위로 판단해 원문을 보존한다.
   */
  const CTA_TEMPLATE = /지금 바로 받아보세요|지금 확인해 보세요/;

  /* 문법만 다듬는 자체 안전 규칙 — 의미를 바꾸지 않는 것만. */
  const SAFE_FIXES = [
    { id: 'safe-supplier-subject', re: /(저희는|저희가|당사는|당사가|저희 회사는)\s+/g, to: '', label: '공급자 주어 삭제' },
    { id: 'safe-adverb', re: /(매우|정말로|굉장히|너무나|아주)\s+/g, to: '', label: '강조 부사 삭제' },
    { id: 'safe-double-passive', re: /되어집니다/g, to: '됩니다', label: '이중 피동' },
    { id: 'safe-double-passive2', re: /되어질 수 있(습니다|다)/g, to: '됩니다', label: '이중 피동' },
    { id: 'safe-double-passive3', re: /되어진/g, to: '된', label: '이중 피동' },
    { id: 'safe-double-passive4', re: /되어져/g, to: '되어', label: '이중 피동' },
    { id: 'safe-spacing', re: /[ \t]{2,}/g, to: ' ', label: '공백 정리' },
  ];

  function safePass(text) {
    let out = String(text || '');
    const applied = [];
    SAFE_FIXES.forEach(rule => {
      const before = out;
      out = out.replace(rule.re, rule.to);
      if (out !== before) applied.push({ ruleId: rule.id, type: 'safe', from: rule.re.source, to: rule.to, label: rule.label });
    });
    return { text: out.replace(/^\s+|\s+$/g, ''), applied };
  }

  function correctCopy(text) {
    const CP = ENGINES.CopyPsych;
    const t = cleanText(text);
    if (!CP) return { ok: false, text: t, applied: [], rejected: [], before: 0, after: 0, improved: 0 };

    const applied = [];
    const rejected = [];
    const fixSentence = (sentence) => {
      if (!sentence.trim()) return sentence;
      /* 1) 의미를 건드리지 않는 자체 교정 먼저 */
      const safe = safePass(sentence);
      const base = safe.text || sentence;
      safe.applied.forEach(a => applied.push(a));
      /* 2) 엔진 교정은 문장을 통째로 바꾸지 않을 때만 덮어쓴다 */
      let r;
      try { r = CP.correct(base); } catch (e) { return base; }
      if (!r || r.text === base) return base;
      sentence = base;
      const injectedCTA = CTA_TEMPLATE.test(r.text) && !CTA_TEMPLATE.test(sentence);
      const grew = r.text.length > sentence.length * 1.4 + 6;
      if (injectedCTA || grew) {
        rejected.push({
          from: sentence,
          to: r.text,
          rules: (r.applied || []).map(a => a.ruleId),
          reason: '문장을 통째로 다른 문장(CTA)으로 바꾸는 제안이라 자동 적용하지 않았습니다. 대안을 참고해 직접 고쳐 주세요.',
        });
        return sentence;
      }
      (r.applied || []).forEach(a => applied.push(a));
      return r.text;
    };

    const fixed = t.split('\n').map(line =>
      line.split(/(?<=[.!?。！？])\s+/).map(fixSentence).join(' ')).join('\n');
    const result = fixed.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.!?])/g, '$1').trim();
    const before = CP.detect(t);
    const after = CP.detect(result);
    return {
      ok: true,
      text: result,
      applied,
      rejected,
      before: before.friction,
      after: after.friction,
      improved: Math.max(0, before.friction - after.friction),
      remaining: (after.issues || []).slice(0, 4).map(i => ({
        type: i.type, typeLabel: i.typeLabel, phrase: i.phrase, alternative: i.alternative,
      })),
    };
  }

  /** 맥락 → 핀터레스트 스타일 3~4안 (이유 포함) */
  function recommendStyles(project, script) {
    const DR = ENGINES.DesignRef;
    const text = projectText(project, script) || '카드뉴스';
    if (!DR) return { ok: false, reason: 'design-engine-missing', text, refs: [], rejected: [] };
    const rec = DR.recommendDesignRefs({ text, purpose: 'cardnews' });
    return {
      ok: true,
      text,
      context: {
        industry: rec.context.industry,
        mood: rec.context.mood,
        purpose: rec.context.purpose,
        purposeLabel: rec.context.purposeLabel,
        density: {
          level: rec.context.density.level,
          chars: rec.context.density.chars,
          note: rec.context.density.note,
        },
        signals: rec.context.signals,
      },
      note: rec.note,
      refs: rec.refs.map(r => ({
        rank: r.rank, id: r.id, name: r.name, family: r.family, familyLabel: r.familyLabel,
        score: r.score, percent: Math.round(r.score * 100),
        reasons: r.reasons.map(x => x.text).slice(0, 3),
        risk: {
          value: r.defaultRisk.risk, label: r.defaultRisk.label,
          flagged: r.defaultRisk.flagged, reasons: (r.defaultRisk.reasons || []).slice(0, 2),
        },
        structure: r.dna.layout.structure,
        palette: {
          bg: r.dna.palette.bg, surface: r.dna.palette.surface, ink: r.dna.palette.ink,
          sub: r.dna.palette.sub, line: r.dna.palette.line, accent: r.dna.palette.accent,
          accentInk: r.dna.palette.accentInk, accentSoft: r.dna.palette.accentSoft,
        },
        imageRatio: r.dna.image.ratio,
        textOnImage: !!r.dna.image.textOnImage,
        typeNote: r.dna.type ? r.dna.type.hierarchyNote : '',
      })),
      rejected: (rec.rejected || []).map(x => ({ id: x.id, name: x.name, reason: x.reason })),
    };
  }

  /** 알려진 프리셋만 통과(적용·복원 시 안전장치) */
  function stylePreset(id) {
    const DR = ENGINES.DesignRef;
    if (!DR || !id) return null;
    try { return DR.get(String(id)); } catch (e) { return null; }
  }

  function styleList() {
    const DR = ENGINES.DesignRef;
    return DR ? DR.PRESETS.map(p => ({ id: p.id, name: p.name, family: p.family, tagline: p.tagline })) : [];
  }

  /** 추출 팔레트 → 기존 6테마와 같은 인터페이스의 커스텀 테마 */
  function themeFromPalette(palette, name) {
    const p = palette || {};
    if (!['bg', 'surface', 'ink', 'sub', 'line', 'accent', 'accentInk'].every(k => isHexColor(p[k]))) return null;
    const bg = p.bg;
    const surface = p.surface || bg;
    return {
      id: 'ref-palette', name: name || '레퍼런스 색', desc: '추출 팔레트',
      bg,
      bgTo: mixHex(bg, p.ink, 0.07) || surface,
      ink: p.ink,
      inkSoft: p.sub || mixHex(p.ink, bg, 0.35),
      accent: p.accent,
      line: p.line || mixHex(bg, p.ink, 0.16),
      badgeBg: p.ink,
      badgeInk: bg,
      emStyle: 'highlight',
      decor: 'grid',
      panel: surface,
    };
  }

  /** 프로젝트에 적용할 테마 해석(추출 팔레트가 있으면 우선) */
  function resolveTheme(project) {
    const p = project || {};
    if (p.customTheme && p.customTheme.palette) {
      const custom = themeFromPalette(p.customTheme.palette, p.customTheme.name);
      if (custom) return custom;
    }
    return themeById(p.theme);
  }

  function sanitizeDesign(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const preset = stylePreset(raw.presetId);
    const image = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(raw.image || '')) ? String(raw.image) : '';
    if (!preset && !image) return null;
    return { presetId: preset ? preset.id : null, image };
  }

  function sanitizeCustomTheme(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const pal = raw.palette || {};
    const keys = ['bg', 'surface', 'ink', 'sub', 'line', 'accent', 'accentInk', 'accentSoft'];
    if (!keys.every(k => isHexColor(pal[k]))) return null;
    const palette = {};
    keys.forEach(k => { palette[k] = String(pal[k]).toUpperCase(); });
    return { name: String(raw.name || '레퍼런스 색').slice(0, 24), palette };
  }

  /* ── 카피 프레임워크: 입력 만들기 → 생성 → 슬라이드·대본 반영 ── */
  function frameworkInput(project, script) {
    const p = project || {};
    const slides = p.slides || [];
    const plain = t => stripEmphasis(cleanText(t));
    const cover = slides.find(s => s.kind === 'cover') || slides[0] || {};
    const bodies = slides.filter(s => s.kind === 'body');
    const cta = slides.find(s => s.kind === 'cta') || {};
    const all = slides.map(s => plain(s.title) + ' ' + plain(s.body)).join(' ');
    const nums = all.match(/\d[\d,.]*\s*(?:%|퍼센트|배|만|억|원|명|시간|분|초|개월|개|년|주|달|일|위|건)?/g) || [];
    const urgencyMatch = all.match(/[^.!?\n]*(?:마감|한정|선착순|오늘|품절|D-\d)[^.!?\n]*/);
    const first = bodies[0] || {};
    const second = bodies[1] || {};
    return {
      product: truncateAt(plain(cover.title), 26, false) || '이 카드뉴스',
      target: cleanText(script && script.target) || '처음 보는 사람',
      problem: truncateAt(plain(cover.body), 60) || truncateAt(plain(first.title), 60),
      solution: truncateAt(plain(first.body), 60) || truncateAt(plain(second.title), 60),
      proof: nums.slice(0, 2).join(', '),
      cta: truncateAt(plain(cta.title), 28) || (p.handle ? '프로필에서 더 보기' : '저장해두기'),
      urgency: urgencyMatch ? truncateAt(urgencyMatch[0].trim(), 36) : '',
      priceBefore: '',
      priceAfter: '',
      guarantee: '',
      brand: cleanText(p.badge) || '',
      tone: 'casual',
    };
  }

  function buildFramework(project, script, frameworkId) {
    const CP = ENGINES.CopyPsych;
    if (!CP) return { ok: false, reason: 'copy-engine-missing' };
    const input = frameworkInput(project, script);
    const out = CP.build(frameworkId || 'PAS', input);
    return {
      ok: true,
      id: out.id,
      name: out.name,
      en: out.en,
      title: out.title,
      sections: out.sections.map(s => ({ label: s.label, text: s.text })),
      body: out.body,
      chars: out.chars,
      psych: out.psych,
      input: out.input,
    };
  }

  /** 프레임워크 결과 → 표지 + 본문 + 마무리 슬라이드 */
  function slidesFromFramework(fw, opts) {
    const o = opts || {};
    if (!fw || !Array.isArray(fw.sections) || !fw.sections.length) return [];
    const stamp = o.stamp || ('fw' + hashStr(fw.title + fw.id));
    const badge = o.badge || 'CARD NEWS';
    const sec = fw.sections;
    const coverBody = truncateAt(stripEmphasis(cleanText(sec[0].text)).replace(/\n+/g, ' '), 60, true);

    const bodies = sec.slice(1).map((s, i) => {
      const sentences = splitSentences(s.text || '');
      let head = (sentences[0] || s.text || s.label).replace(/\n+/g, ' ');
      let rest = sentences.slice(1).join(' ');
      if (stripEmphasis(head).length > 40) {
        const plainHead = stripEmphasis(head);
        let cut = plainHead.lastIndexOf(' ', 40);
        if (cut < 16) cut = 40;
        rest = cleanText(plainHead.slice(cut) + ' ' + rest);
        head = plainHead.slice(0, cut);
      }
      return {
        id: stamp + 'b' + (i + 1),
        kind: 'body',
        badge: String(s.label || '').slice(0, 20),
        title: emphasizeFirstNumber(truncateAt(head, 44)),
        body: rest ? emphasizeFirstNumber(truncateAt(rest, 160)) : '',
      };
    }).slice(0, MAX_BODY_SLIDES);

    const cta = o.cta || pickCta(fw.title);
    return [{
      id: stamp + 'c',
      kind: 'cover',
      badge,
      title: emphasizeFirstNumber(truncateAt(stripEmphasis(fw.title).replace(/\n+/g, ' '), 46)),
      body: coverBody ? emphasizeFirstNumber(coverBody) : '',
    }].concat(bodies, [{
      id: stamp + 't',
      kind: 'cta',
      badge: '',
      title: cta.title,
      body: cta.body,
    }]);
  }

  /** 프리셋 렌더러가 쓸 슬라이드별 카드 내용(배지·킥커·CTA·페이지) */
  function presetContent(project, index) {
    const p = project || {};
    const slides = p.slides || [];
    const total = slides.length || 1;
    const i = clamp(parseInt(index, 10) || 0, 0, total - 1);
    const slide = slides[i] || {};
    const num = String(i + 1).padStart(2, '0');
    const badgeText = slide.kind === 'cover'
      ? (slide.badge || p.badge || 'CARD NEWS')
      : (slide.badge || (num + ' / ' + String(total).padStart(2, '0')));
    return {
      kind: slide.kind || 'body',
      index: i,
      total,
      badge: cleanText(badgeText).toUpperCase().slice(0, 24),
      kicker: KIND_LABEL[slide.kind] || '카드뉴스',
      title: String(slide.title || ''),
      body: String(slide.body || ''),
      cta: slide.kind === 'cta' ? '팔로우하기' : '저장하기',
      handle: cleanText(p.handle),
      page: pageLabel(i, total),
      photo: (p.design && p.design.image) || '',
    };
  }

  /* ── buildFrameworkFrom: 모달에서 고친 입력으로 바로 생성 ── */
  function buildFrameworkFrom(input, frameworkId) {
    const CP = ENGINES.CopyPsych;
    if (!CP) return { ok: false, reason: 'copy-engine-missing' };
    const out = CP.build(frameworkId || 'PAS', input || {});
    return {
      ok: true,
      id: out.id,
      name: out.name,
      en: out.en,
      title: out.title,
      sections: out.sections.map(s => ({ label: s.label, text: s.text })),
      body: out.body,
      chars: out.chars,
      psych: out.psych,
      input: out.input,
    };
  }

  /* ══════════════════════════════════════════════════════════
     내 구독 AI 원클릭 브리지
      ① 프롬프트를 만들어 복사 → ChatGPT/Claude/Gemini 새 창
      ② 돌아온 답변(JSON 또는 설명 섞인 글)을 파싱해 카드/대본에 적용
      ③ 선택: 무료 Gemini API 키로 앱 안에서 바로 생성
     ══════════════════════════════════════════════════════════ */
  const BRIDGE_PROVIDERS = [
    { id: 'chatgpt', name: 'ChatGPT', desc: 'Plus·무료 모두', url: 'https://chatgpt.com/', action: '새 대화 열기' },
    { id: 'claude', name: 'Claude', desc: 'Pro·무료 모두', url: 'https://claude.ai/new', action: '새 대화 열기' },
    { id: 'gemini', name: 'Gemini', desc: '2.5 Flash 무료', url: 'https://gemini.google.com/app', action: '새 대화 열기' },
  ];
  const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

  const BRIDGE_KINDS = [
    { id: 'cards', label: '카드뉴스 세트', hint: '표지·본문·마무리 슬라이드' },
    { id: 'script', label: '30초 대본', hint: '4구간 대본과 화면 자막' },
    { id: 'critique', label: '카피 개선안', hint: '진단·고칠 문장' },
  ];

  function bridgeContentBrief(project, script) {
    const p = project || {};
    const rows = [];
    (p.slides || []).forEach((s, i) => {
      const title = stripEmphasis(cleanText(s.title));
      const body = stripEmphasis(cleanText(s.body)).replace(/\n+/g, ' / ');
      rows.push(`${i + 1}. [${KIND_LABEL[s.kind] || s.kind}] 제목: ${title || '(없음)'} | 본문: ${body || '(없음)'}`);
    });
    if (p.handle) rows.push(`핸들: ${cleanText(p.handle)}`);
    if (script) {
      rows.push(`대본 주제: ${cleanText(script.topic) || '(없음)'} / 타겟: ${cleanText(script.target) || '(없음)'}`);
      const pts = (script.points || []).map(x => cleanText(x)).filter(Boolean);
      if (pts.length) rows.push('핵심 포인트: ' + pts.join(' · '));
    }
    return rows.join('\n') || '(아직 내용이 없습니다. 주제만 정해 주세요.)';
  }

  /** 복사해서 각 AI에 붙여넣을 프롬프트 */
  function buildBridgePrompt(project, script, kind) {
    const k = ['cards', 'script', 'critique'].indexOf(kind) >= 0 ? kind : 'cards';
    const brief = bridgeContentBrief(project, script);
    const common = [
      '[역할]',
      '한국어 카드뉴스·숏폼 카피라이터. 아래 내 콘텐츠를 그대로 살리되 더 세게 다시 써라.',
      '',
      '[내 콘텐츠]',
      brief,
      '',
      '[지켜야 할 것]',
      '1. 한 장에 한 가지만. 제목 34자 이내, 본문 90자 이내(줄바꿈으로 문단 구분).',
      '2. 말할 때 쓰는 구어체. 번역체·요약체·"~에 대해 알아보겠습니다" 같은 AI 상투어 금지.',
      '3. 숫자는 내가 준 값만 쓴다. 없는 수치를 새로 만들지 말고 빼라.',
      '4. 강조할 단어는 **이렇게** 별표 두 개로 감싼다.',
      '5. 8대 트리거(손실회피·구체숫자·호기심갭·인지반전·사회적증거·희소성·권위·저마찰CTA) 중 최소 4개를 채운다.',
      '6. 첫 문장은 결론부터. 미사여구·감사 인사 금지.',
    ].join('\n');

    if (k === 'script') {
      return [
        common,
        '',
        '[출력 형식 — 아래 JSON 하나만. 설명·인사·코드블록 밖 문장 금지]',
        '{"topic":"주제","target":"타겟","beats":[',
        '  {"id":"hook","narration":"0~3초에 말할 문장(17자 안팎)","screen":["화면 자막1","화면 자막2"]},',
        '  {"id":"problem","narration":"3~12초(50자 안팎)","screen":["...","..."]},',
        '  {"id":"proof","narration":"12~25초(72자 안팎)","screen":["...","..."]},',
        '  {"id":"cta","narration":"25~30초(28자 안팎)","screen":["...","..."]}',
        ']}',
        '',
        '[촬영 기준]',
        '화면 자막은 한 줄 15자 이내, 최대 2줄. CTA는 저장 또는 팔로우 하나만.',
      ].join('\n');
    }

    if (k === 'critique') {
      return [
        common,
        '',
        '[할 일]',
        '내 카드뉴스 문장을 8대 트리거로 진단하고, 점수를 깎는 표현을 지적한 뒤, 고친 문장을 줘라.',
        '',
        '[출력 형식 — 아래 JSON 하나만]',
        '{"score":0,"problems":["문제점 3개"],"fixes":["고칠 문장 3개"],"rewritten":{"title":"다시 쓴 표지 제목","body":"다시 쓴 표지 본문"}}',
      ].join('\n');
    }

    return [
      common,
      '',
      '[출력 형식 — 아래 JSON 하나만. 설명·인사·코드블록 밖 문장 금지]',
      '{"slides":[',
      '  {"kind":"cover","badge":"CARD NEWS","title":"표지 제목","body":"한 줄 부제"},',
      '  {"kind":"body","badge":"","title":"본문 1 제목","body":"근거 한두 문장"},',
      '  {"kind":"body","badge":"","title":"본문 2 제목","body":"근거 한두 문장"},',
      '  {"kind":"cta","badge":"","title":"마무리 한 줄","body":"저장·팔로우 부탁"}',
      ']}',
      '',
      '[분량]',
      '표지 1장 + 본문 2~4장 + 마무리 1장. 본문은 근거·예시·반전 순서로.',
    ].join('\n');
  }

  /* ── 답변 파싱 ─────────────────────────────────────────── */
  function extractJsonBlocks(text) {
    const s = String(text || '');
    const out = [];
    const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    let m;
    while ((m = fence.exec(s)) !== null) out.push(m[1]);
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '{') continue;
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < s.length; j++) {
        const ch = s[j];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { out.push(s.slice(i, j + 1)); i = j; break; } }
      }
    }
    return out;
  }

  function parseJsonLoose(raw) {
    const tries = [raw, raw.replace(/,\s*([}\]])/g, '$1'), raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")];
    for (let i = 0; i < tries.length; i++) {
      try {
        const v = JSON.parse(tries[i]);
        if (v && typeof v === 'object') return v;
      } catch (e) { /* 다음 시도 */ }
    }
    return null;
  }

  function coerceSlides(rawSlides) {
    const list = Array.isArray(rawSlides) ? rawSlides : [];
    const out = [];
    list.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const kindRaw = String(s.kind || s.type || s.role || '').toLowerCase();
      const kind = /cover|표지|封面/.test(kindRaw) ? 'cover'
        : /cta|end|마무리|结尾/.test(kindRaw) ? 'cta'
          : i === 0 && !out.some(x => x.kind === 'cover') ? 'cover'
            : 'body';
      out.push({
        kind,
        badge: String(s.badge == null ? '' : s.badge).slice(0, 24),
        title: cleanText(String(s.title == null ? '' : s.title)).slice(0, 200),
        body: cleanText(String(s.body == null ? '' : s.body)).slice(0, 600),
      });
    });
    return out;
  }

  function parsePlainSlides(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    const blocks = [];
    let cur = null;
    lines.forEach(line => {
      if (/^(?:#{1,4}\s*|\d+[.)]\s*|[-•*✔]\s*)/.test(line) && /(표지|본문|마무리|cover|body|cta|\d)/i.test(line)) {
        if (cur) blocks.push(cur);
        cur = { title: line.replace(/^(?:#{1,4}\s*|\d+[.)]\s*|[-•*✔]\s*)/, '').trim(), body: '' };
      } else if (/^(?:제목|title)\s*[:：]/i.test(line)) {
        if (!cur) cur = { title: '', body: '' };
        cur.title = line.replace(/^(?:제목|title)\s*[:：]/i, '').trim();
      } else if (/^(?:본문|내용|body)\s*[:：]/i.test(line)) {
        if (!cur) cur = { title: '', body: '' };
        cur.body = (cur.body ? cur.body + ' ' : '') + line.replace(/^(?:본문|내용|body)\s*[:：]/i, '').trim();
      } else if (cur) {
        cur.body = (cur.body ? cur.body + ' ' : '') + line;
      }
    });
    if (cur) blocks.push(cur);
    return blocks.filter(b => b.title || b.body).slice(0, 8).map(b => ({
      kind: '', badge: '', title: b.title, body: b.body,
    }));
  }

  function parsePlainBeats(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    const beats = [];
    let cur = null;
    lines.forEach(line => {
      const m = line.match(/^(?:\[)?(0\s*~\.?\s*3|3\s*~\.?\s*12|12\s*~\.?\s*25|25\s*~\.?\s*30)\s*초?\]?\s*[:：-]?\s*(.*)$/);
      const labelHit = line.match(/^(?:\[)?(훅|hook|문제|problem|증거|proof|반전|cta|마무리)\]?\s*[:：-]?\s*(.*)$/i);
      if (m) {
        if (cur) beats.push(cur);
        cur = { id: '', narration: m[2] || '', screen: [] };
      } else if (labelHit) {
        if (cur) beats.push(cur);
        const id = /훅|hook/i.test(labelHit[1]) ? 'hook'
          : /문제|problem/i.test(labelHit[1]) ? 'problem'
            : /증거|proof|반전/i.test(labelHit[1]) ? 'proof' : 'cta';
        cur = { id, narration: labelHit[2] || '', screen: [] };
      } else if (cur) {
        if (/^(?:화면|자막|screen)\s*[:：]/i.test(line)) {
          cur.screen = line.replace(/^(?:화면|자막|screen)\s*[:：]/i, '').split(/[/|·]/).map(x => cleanText(x)).filter(Boolean).slice(0, 2);
        } else {
          cur.narration = (cur.narration ? cur.narration + ' ' : '') + line;
        }
      }
    });
    if (cur) beats.push(cur);
    return beats.slice(0, 4);
  }

  /** AI 답변 → 슬라이드/비트 (JSON 우선, 실패하면 문장 파싱) */
  function parseBridgeAnswer(text, kind) {
    const raw = String(text || '');
    const warnings = [];
    if (!raw.trim()) return { ok: false, kind, format: 'none', reason: 'empty', warnings: ['붙여넣은 답변이 없습니다.'] };

    let parsed = null;
    let format = 'none';
    const blocks = extractJsonBlocks(raw);
    for (let i = 0; i < blocks.length; i++) {
      const v = parseJsonLoose(blocks[i]);
      if (v && (Array.isArray(v.slides) || Array.isArray(v.beats) || v.script || v.cards)) { parsed = v; format = 'json'; break; }
      if (v && !parsed) { parsed = v; format = 'json'; }
    }

    if (parsed) {
      const wrapped = parsed.script || parsed.result || parsed.data || parsed;
      const rawSlides = Array.isArray(parsed.slides) ? parsed.slides
        : Array.isArray(parsed.cards) ? parsed.cards
          : Array.isArray(wrapped.slides) ? wrapped.slides
            : Array.isArray(wrapped.cards) ? wrapped.cards : null;
      const rawBeats = Array.isArray(parsed.beats) ? parsed.beats
        : Array.isArray(wrapped.beats) ? wrapped.beats : null;

      if (rawSlides && rawSlides.length) {
        const slides = coerceSlides(rawSlides);
        if (slides.length) {
          return { ok: true, kind: 'cards', format, slides, warnings, narrative: parsed.narrative || parsed.comment || '' };
        }
      }
      if (rawBeats && rawBeats.length) {
        const beats = rawBeats.slice(0, 4).map((b, i) => ({
          id: String(b.id || ''),
          narration: cleanText(String(b.narration || b.text || b.line || '')),
          screen: (Array.isArray(b.screen) ? b.screen : []).map(x => cleanText(String(x))).filter(Boolean).slice(0, 3),
          _i: i,
        }));
        if (beats.some(b => b.narration)) {
          return {
            ok: true, kind: 'script', format, beats, warnings,
            topic: cleanText(String(parsed.topic || wrapped.topic || '')),
            target: cleanText(String(parsed.target || wrapped.target || '')),
          };
        }
      }
      if (Array.isArray(parsed.problems) || Array.isArray(parsed.fixes)) {
        return {
          ok: true, kind: 'critique', format, warnings,
          critique: {
            score: Number(parsed.score) || 0,
            problems: (parsed.problems || []).map(x => cleanText(String(x))).slice(0, 6),
            fixes: (parsed.fixes || []).map(x => cleanText(String(x))).slice(0, 6),
            rewritten: parsed.rewritten || null,
          },
        };
      }
      warnings.push('JSON은 찾았지만 slides/beats가 없습니다.');
    }

    const plainSlides = parsePlainSlides(raw);
    if (plainSlides.length >= 2) {
      return { ok: true, kind: 'cards', format: 'text', slides: coerceSlides(plainSlides), warnings };
    }
    const plainBeats = parsePlainBeats(raw);
    if (plainBeats.length >= 3) {
      return { ok: true, kind: 'script', format: 'text', beats: plainBeats, warnings };
    }

    return {
      ok: false, kind, format: 'none', warnings: warnings.concat(['슬라이드나 대본 구조를 찾지 못했습니다. "다시 읽기"로 형식을 바꾸거나 프롬프트를 그대로 다시 물어보세요.']),
    };
  }

  /** 파싱 결과 → 프로젝트 슬라이드(안전 정리) */
  function applyBridgeSlides(project, parsed) {
    const slides = coerceSlides((parsed && parsed.slides) || []);
    if (!slides.length) return null;
    let cover = slides.filter(s => s.kind === 'cover')[0] || slides[0];
    const bodies = slides.filter(s => s !== cover && s.kind === 'body').slice(0, MAX_BODY_SLIDES);
    let cta = slides.filter(s => s.kind === 'cta')[0];
    if (!cta) {
      const picked = pickCta(cover.title);
      cta = { kind: 'cta', badge: '', title: picked.title, body: picked.body };
    }
    const stamp = 'ai' + hashStr(cover.title + (parsed.text || '')).toString(36).slice(0, 5);
    const ordered = [cover].concat(bodies, [cta]);
    return ordered.map((s, i) => ({
      id: stamp + i,
      kind: s.kind === 'cover' ? 'cover' : (s === cta ? 'cta' : 'body'),
      badge: String(s.badge || '').slice(0, 24),
      title: emphasizeFirstNumber(String(s.title || '').slice(0, 200)),
      body: String(s.body || '').slice(0, 600),
    }));
  }

  /** 파싱 결과 → 대본(4구간 고정, 자막 재계산) */
  function applyBridgeScript(script, parsed) {
    const src = (parsed && parsed.beats) || [];
    if (!src.length) return null;
    const byId = {};
    src.forEach((b, i) => {
      const id = BEATS[i] ? BEATS[i].id : '';
      const key = ['hook', 'problem', 'proof', 'cta'].indexOf(String(b.id || '')) >= 0 ? String(b.id) : id;
      if (key && !byId[key]) byId[key] = b;
    });
    const beats = BEATS.map((b, i) => {
      const s = byId[b.id] || src[i] || {};
      return {
        id: b.id,
        narration: cleanText(String(s.narration || '')),
        screen: (Array.isArray(s.screen) ? s.screen : []).map(x => cleanText(String(x))).filter(Boolean).slice(0, 2),
      };
    }).filter(b => b.narration);
    if (!beats.length) return null;
    return {
      topic: cleanText((parsed && parsed.topic) || (script && script.topic) || ''),
      target: cleanText((parsed && parsed.target) || (script && script.target) || ''),
      points: (script && script.points) || ['', '', ''],
      hook: (script && script.hook) || 'loss',
      framework: null,
      beats,
    };
  }

  function geminiEndpoint(model) {
    return GEMINI_ENDPOINT + '/models/' + encodeURIComponent(model || GEMINI_DEFAULT_MODEL) + ':generateContent';
  }

  /** Gemini 응답 JSON → 텍스트 */
  function parseGeminiResponse(json) {
    if (!json || typeof json !== 'object') return '';
    if (json.error) return '';
    const c = (json.candidates || [])[0];
    if (!c) return '';
    const parts = (c.content && c.content.parts) || [];
    return parts.map(p => p.text || '').join('').trim();
  }

  function geminiErrorText(status, json) {
    const msg = (json && json.error && json.error.message) || '';
    if (status === 400 && /API key/i.test(msg)) return 'API 키가 올바르지 않습니다. Google AI Studio에서 다시 복사해 주세요.';
    if (status === 403) return '이 키로는 호출할 수 없습니다(권한·리전 제한). 새 키를 만들어 보세요.';
    if (status === 404) return '모델 이름이 없습니다. 모델을 다시 고르세요.';
    if (status === 429) return '무료 한도를 넘었습니다. 잠시 뒤 다시 시도하세요. 결제는 되지 않습니다.';
    if (status >= 500) return 'Google 서버가 잠시 응답하지 않습니다. 조금 뒤 다시 시도하세요.';
    return msg ? ('오류: ' + msg.slice(0, 120)) : ('요청 실패 (' + status + ')');
  }

  /* ── project helpers ────────────────────────────────────── */
  function slideId(n) { return 's' + (n || Date.now().toString(36)); }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function createProject(overrides) {
    const base = clone(SAMPLE_PROJECT);
    base.slides.forEach((s, i) => { s.id = 's' + (i + 1); });
    return Object.assign(base, overrides || {});
  }

  function bodyCount(slides) {
    return (slides || []).filter(s => s.kind === 'body').length;
  }

  /** 표지 → 본문… → 마무리 순서를 유지한다(종류 변경 시 재배치). */
  function normalizeOrder(slides) {
    const covers = slides.filter(s => s.kind === 'cover');
    const bodies = slides.filter(s => s.kind === 'body');
    const ctas = slides.filter(s => s.kind === 'cta');
    return covers.concat(bodies, ctas);
  }

  function makeSlide(kind, extra) {
    const base = { id: slideId(Math.random().toString(36).slice(2, 7)), kind: kind || 'body', badge: '', title: '', body: '' };
    if (kind === 'cover') { base.badge = 'CARD NEWS'; base.title = '표지 제목을 **입력**하세요'; base.body = '한 줄 설명을 넣으세요.'; }
    else if (kind === 'cta') { base.title = '마무리 **한 줄**'; base.body = '저장·팔로우를 부탁하는 문장.'; }
    else { base.title = '본문 제목'; base.body = '근거와 예시를 한두 문장으로.'; }
    return Object.assign(base, extra || {});
  }

  function pageLabel(index, total) { return `${index + 1} / ${total}`; }

  /** 저장된 프리셋을 안전하게 다듬는다(형식 검증). */
  function sanitizeProject(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const out = {
      ratio: RATIOS.some(r => r.id === p.ratio) ? p.ratio : '4x5',
      theme: THEMES.some(t => t.id === p.theme) ? p.theme : 'white-card',
      handle: String(p.handle == null ? '' : p.handle).slice(0, 40),
      badge: String(p.badge == null ? 'CARD NEWS' : p.badge).slice(0, 24),
      showBadge: p.showBadge !== false,
      showHandle: p.showHandle !== false,
      showPage: p.showPage !== false,
      design: sanitizeDesign(p.design),
      customTheme: sanitizeCustomTheme(p.customTheme),
      slides: [],
    };
    const slides = Array.isArray(p.slides) ? p.slides.slice(0, MAX_SLIDES) : [];
    slides.forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const kind = s.kind === 'cover' || s.kind === 'cta' ? s.kind : 'body';
      out.slides.push({
        id: String(s.id || 's' + (i + 1)),
        kind,
        badge: String(s.badge || '').slice(0, 30),
        title: String(s.title || '').slice(0, 200),
        body: String(s.body || '').slice(0, 600),
      });
    });
    if (!out.slides.length) out.slides = createProject().slides;
    // 표지/마무리는 각각 최대 1장만 인정
    let coverSeen = false, ctaSeen = false;
    out.slides = out.slides.filter(s => {
      if (s.kind === 'cover') { if (coverSeen) s.kind = 'body'; coverSeen = true; }
      if (s.kind === 'cta') { if (ctaSeen) s.kind = 'body'; ctaSeen = true; }
      return true;
    });
    out.slides = normalizeOrder(out.slides);
    let bodies = 0;
    out.slides = out.slides.filter(s => {
      if (s.kind !== 'body') return true;
      bodies += 1;
      return bodies <= MAX_BODY_SLIDES;
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     엔진 v2 — 레퍼런스 검색 · 사진 해부 블루프린트 · 폰트 믹스 ·
     종이 질감 · 카드 세트 밀도 · 브랜드 키트
     ══════════════════════════════════════════════════════════ */
  const DEFAULT_FONT_MIX = 'pretendard-only';
  const DEFAULT_GRAIN = 'none';

  function designV2Ready() {
    const DR = ENGINES.DesignRef;
    return !!(DR && DR.V2 && typeof DR.applyBlueprintJSON === 'function'
      && typeof DR.serializeBrandKit === 'function');
  }

  function designV2Info() {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) {
      return { ok: false, version: DR ? DR.VERSION : null, schema: null, densityLimit: 25, mixes: [], grains: [] };
    }
    return {
      ok: true,
      version: DR.VERSION,
      schema: DR.V2.schema,
      densityLimit: DR.V2.densityLimit,
      mixes: DR.listFontMixes().map(m => ({ id: m.id, name: m.name, note: m.note })),
      grains: DR.listGrains().map(g => ({ id: g.id, name: g.name, amount: g.amount, note: g.note })),
    };
  }

  function styleOfFamily(family) {
    if (family === 'serif-heading' || family === 'serif') return 'serif';
    if (family === 'rounded') return 'rounded';
    if (family === 'mono') return 'mono';
    return 'sans';
  }

  /** 프로젝트 글 → 핀터레스트·비핸스 검색 링크 */
  function referenceSearches(project, script) {
    const DR = ENGINES.DesignRef;
    const text = projectText(project, script) || '카드뉴스';
    if (!designV2Ready()) return { ok: false, reason: 'design-v2-missing', text, queries: [], links: [] };
    const r = DR.buildReferenceSearchUrls({ text, purpose: 'cardnews' });
    return {
      ok: true,
      text,
      context: r.context,
      queries: r.queries,
      links: r.links.map(l => ({ site: l.site, siteLabel: l.siteLabel, lang: l.lang, q: l.q, label: l.label, url: l.url })),
      note: r.note,
    };
  }

  /** 이 비율·이 슬라이드 내용으로 만든 사진 해부 프롬프트 */
  function visionPrompt(project, script, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, prompt: '' };
    const o = opts || {};
    const p = project || {};
    const ratio = ratioById(p.ratio).short;
    const card = o.content || slideContent(p.slides && p.slides[o.index || 0], p, o.index || 0);
    const vp = DR.buildVisionBlueprintPrompt({
      title: card.title,
      body: card.body,
      text: projectText(p, script),
      purpose: '카드뉴스',
      ratio,
    });
    return {
      ok: true, prompt: vp.prompt, schema: vp.schema, example: vp.example,
      jsonOnly: vp.jsonOnly, ratio: vp.ratio, chars: vp.chars, tips: vp.tips || [],
    };
  }

  /** 슬라이드 1장 → 엔진에 넣을 카드 문구 */
  function slideContent(slide, project, index) {
    const p = project || {};
    const s = slide || {};
    const slides = p.slides || [];
    const total = slides.length || 1;
    const plain = t => stripEmphasis(cleanText(t)).replace(/\s+/g, ' ').trim();
    const pad2 = n => String(n).padStart(2, '0');
    const kind = s.kind || 'body';
    const badge = cleanText(s.badge || (kind === 'cover' ? p.badge : ''));
    return {
      kicker: kind === 'cover' ? 'CARD NEWS' : '',
      title: plain(s.title) || '제목',
      body: plain(s.body),
      cta: kind === 'cta' ? '저장하고 팔로우' : '',
      badge,
      brand: cleanText(p.handle, ''),
      numbering: pad2(index + 1) + '/' + pad2(total),
    };
  }

  /** 카드 세트 전체의 글자 밀도(한 장 25자 기준) */
  function cardSetDensity(project) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return null;
    const slides = (project && project.slides) || [];
    const cards = slides.map((s, i) => slideContent(s, project, i));
    return DR.checkVisualDensity(cards);
  }

  /** AI 문자열 → 블루프린트 (카드 1장 문구 기준) */
  function applyBlueprint(aiText, content, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, error: '디자인 엔진 v2를 불러오지 못했습니다.' };
    if (!String(aiText == null ? '' : aiText).trim()) return { ok: false, error: 'AI가 준 JSON을 먼저 붙여넣어 주세요.' };
    const o = opts || {};
    let out;
    try {
      out = DR.applyBlueprintJSON(aiText, content || {}, {
        width: o.width || 320,
        css: { selector: '.v2-scope', prefix: 'v2' },
      });
    } catch (e) {
      return { ok: false, error: (e && e.message) || 'JSON을 읽지 못했습니다.' };
    }
    if (!out || !out.ok) return { ok: false, error: (out && out.error) || 'JSON을 읽지 못했습니다.', warnings: [] };
    return {
      ok: true,
      blueprint: out.blueprint,
      html: out.html,
      css: out.css,
      canvas: out.canvas,
      density: out.density,
      warnings: (out.warnings || []).slice(),
      fixes: (out.fixes || []).slice(),
      meta: out.meta,
      name: (out.blueprint && out.blueprint.name) || 'AI 블루프린트',
    };
  }

  function applyFontMixToKit(kit, mixId) {
    const DR = ENGINES.DesignRef;
    if (!kit || !mixId || !DR) return kit;
    let m;
    try { m = DR.fontMix(mixId); } catch (e) { return kit; }
    if (!m) return kit;
    kit.type = Object.assign({}, kit.type, {
      titleFamily: m.title.family,
      bodyFamily: m.body.family,
      titleStyle: styleOfFamily(m.title.family),
      bodyStyle: styleOfFamily(m.body.family),
      titleWeight: m.title.weight,
      bodyWeight: m.body.weight,
      titleTracking: m.title.tracking,
      bodyTracking: m.body.tracking,
      titleLineHeight: m.title.lineHeight,
      bodyLineHeight: m.body.lineHeight,
      fontMix: m.id,
    });
    return kit;
  }

  function tuneKit(kit, opts) {
    const DR = ENGINES.DesignRef;
    if (!kit) return null;
    const o = opts || {};
    let next = kit;
    if (o.fontMix) next = applyFontMixToKit(next, o.fontMix);
    if (o.grain) {
      try { next.grain = DR.normalizeGrain(o.grain); } catch (e) { /* 알 수 없는 질감은 유지 */ }
    }
    try { return DR.serializeBrandKit(next, { name: o.name || kit.name }); }
    catch (e) { return next; }
  }

  function presetKit(presetId, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return null;
    const o = opts || {};
    let kit;
    try {
      kit = DR.serializeBrandKit(presetId || 'commerce-clean', {
        name: o.name || '내 브랜드',
        grain: o.grain || DEFAULT_GRAIN,
        fontMix: o.fontMix || DEFAULT_FONT_MIX,
      });
    } catch (e) { return null; }
    return tuneKit(kit, { fontMix: o.fontMix || DEFAULT_FONT_MIX, grain: o.grain || DEFAULT_GRAIN });
  }

  function blueprintKit(blueprint, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready() || !blueprint) return null;
    const o = opts || {};
    let kit;
    try { kit = DR.serializeBrandKit({ blueprint: blueprint }, { name: o.name || 'AI 블루프린트' }); }
    catch (e) { return null; }
    return tuneKit(kit, { name: o.name, fontMix: o.fontMix, grain: o.grain });
  }

  function cloneJSON(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  /** 4~6자 포스터용 프리셋(minimal-luxury)인지 */
  function presetIsPoster(presetId) {
    const DR = ENGINES.DesignRef;
    if (!DR || !presetId) return false;
    try {
      const dna = DR.dnaOf(presetId);
      return !!(dna && dna.layout && dna.layout.structure === 'minimal-poster');
    } catch (e) { return false; }
  }

  /** 포스터형 프리셋을 긴 제목에서도 겹치지 않게 세로로 다시 잡은 설계도 */
  function posterBlueprint(palette) {
    const p = palette || {};
    return {
      name: '포스터 재배치',
      canvas: { ratio: '4:5' },
      margin: 0.07,
      image: { x: 0, y: 0, w: 1, h: 0.5, ratio: '4:5', fill: true, focal: 'center' },
      title: { x: 0.07, y: 0.54, w: 0.86, h: 0.17, size: 0.062, align: 'center' },
      body: { x: 0.09, y: 0.72, w: 0.82, h: 0.09, size: 0.028 },
      cta: { x: 0.3, y: 0.845, w: 0.4, h: 0.07 },
      badge: { x: 0.06, y: 0.05, style: 'rule' },
      colors: {
        bg: p.bg || '#F7F5F1', surface: p.surface || '#FFFFFF', ink: p.ink || '#171717',
        sub: p.sub || '#6B6B6B', accent: p.accent || '#8A6A3B', accentInk: p.accentInk || '#FFFFFF',
        line: p.line || '#DEDAD3',
      },
      font: { title: 'serif', body: 'sans', titleWeight: 500, bodyWeight: 400 },
      decor: { border: 0, hardShadow: false, paperTexture: true, grain: 'none', rule: true, numbering: '01/05' },
    };
  }

  /**
   * 카드 세트 렌더 — 같은 키트로 모든 슬라이드를 그린다.
   * source: {kind:'preset',presetId} | {kind:'blueprint',blueprint} | {kind:'kit',kit}
   */
  function v2Cards(source, project, opts) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, error: '디자인 엔진 v2를 불러오지 못했습니다.', cards: [] };
    const o = opts || {};
    const p = project || {};
    const width = o.width || 320;
    const src = source || { kind: 'preset' };
    let kit = null;
    let kind = 'preset';

    if (src.kind === 'blueprint') {
      kit = blueprintKit(src.blueprint, { name: src.name || 'AI 블루프린트', fontMix: o.fontMix, grain: o.grain });
      kind = 'blueprint';
    } else if (src.kind === 'kit') {
      kit = tuneKit(cloneJSON(src.kit), { fontMix: o.fontMix, grain: o.grain });
      kind = 'kit';
    } else {
      const presetId = src.presetId || (p.design && p.design.presetId) || 'commerce-clean';
      if (presetIsPoster(presetId)) {
        /* 포스터형은 원래 4~6자 제목용이라 긴 카드 제목이 겹친다. 세로 재배치 설계도로 그린다. */
        const base = stylePreset(presetId);
        kit = blueprintKit(posterBlueprint(base && base.palette), {
          name: (base && base.name ? base.name + ' · 포스터 재배치' : '포스터 재배치'),
          fontMix: o.fontMix || DEFAULT_FONT_MIX,
          grain: o.grain || DEFAULT_GRAIN,
        });
        kind = 'preset';
      } else {
        kit = presetKit(presetId, {
          fontMix: o.fontMix || DEFAULT_FONT_MIX,
          grain: o.grain || DEFAULT_GRAIN,
        });
      }
    }
    if (!kit) return { ok: false, error: '카드를 만들지 못했습니다.', cards: [] };

    const cards = [];
    const warnings = [];
    const slides = p.slides || [];
    slides.forEach((slide, i) => {
      const content = slideContent(slide, p, i);
      let run;
      try {
        run = DR.applyBrandKit(kit, content, {
          width,
          html: { width },
          css: { selector: '.v2-scope', prefix: 'v2' },
        });
      } catch (e) {
        run = null;
      }
      if (!run || !run.ok) {
        warnings.push((i + 1) + '번 카드를 그리지 못했습니다.');
        return;
      }
      cards.push({
        index: i,
        kind: slide.kind,
        content,
        html: run.html,
        css: run.css,
        canvas: run.canvas,
        meta: run.meta,
        warnings: run.warnings || [],
      });
      (run.warnings || []).forEach(w => { if (warnings.indexOf(w) < 0) warnings.push(w); });
    });

    if (kind === 'preset' && presetIsPoster(src.presetId || (p.design && p.design.presetId))) {
      warnings.push('포스터형 레퍼런스는 원래 4~6자 제목용이라, 카드 제목이 겹치지 않도록 세로로 다시 배치했습니다.');
    }

    return {
      ok: cards.length > 0,
      kind,
      name: kit.name,
      kit,
      fontMix: kit.type.fontMix,
      grain: kit.grain ? kit.grain.id : 'none',
      cards,
      density: cardSetDensity(p),
      warnings,
    };
  }

  function kitToJSON(kit) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready() || !kit) return '';
    try { return DR.brandKitJSON(kit); } catch (e) { return ''; }
  }

  function kitFromJSON(text) {
    const DR = ENGINES.DesignRef;
    if (!designV2Ready()) return { ok: false, errors: ['디자인 엔진 v2를 불러오지 못했습니다.'] };
    const parsed = DR.parseBrandKit(String(text == null ? '' : text));
    if (!parsed.ok) return { ok: false, errors: parsed.errors || ['브랜드 키트 JSON을 읽지 못했습니다.'] };
    return { ok: true, kit: parsed.kit, drift: !!parsed.drift, name: parsed.kit.name };
  }

  /** v2 카드 PNG용 캔버스 명령 실행기 */
  function drawCardCommands(ctx, plan) {
    const DR = ENGINES.DesignRef;
    const make = new Function(DR.canvasRunnerSource() + '\nreturn drawDesign;');
    const draw = make();
    draw(ctx, plan);
  }

  const STORAGE = {
    draft: 'cns.v1.draft',
    presets: 'cns.v1.presets',
    theme: 'cns.v1.theme',
    tab: 'cns.v1.tab',
    brandKits: 'cns.v1.brandkits',
    v2: 'cns.v1.v2',
  };

  return {
    RATIOS, THEMES, KIND_LABEL, MAX_BODY_SLIDES, MAX_SLIDES, STORAGE,
    SAMPLE_PROJECT, SAMPLE_SCRIPT, HOOK_TYPES, BEATS, CTA_LIBRARY, SPEECH_CHARS_PER_SEC,
    clamp, ratioById, themeById, hexToRgb, rgba, luminance, contrastRatio,
    normalizeEmphasisTags, parseRuns, stripEmphasis, hasEmphasis,
    layoutRuns, lineToRuns, lineText,
    cleanText, charCount, truncateAt, wrapChars, extractNumber, emphasizeFirstNumber, josa,
    splitSentences, splitTextIntoSlides, pickCta, hashStr,
    buildScript, buildSubtitles, formatTimecode, toSrt, scriptToText, buildAiPrompt,
    speakBudget, clipText,
    crc32, buildZip, toBytes,
    slideId, clone, createProject, bodyCount, normalizeOrder, makeSlide, pageLabel, sanitizeProject,

    /* 엔진 연동 */
    engines: ENGINES,
    enginesReady, isHexColor, mixHex, projectText,
    analyzeCopy, correctCopy, recommendStyles, stylePreset, styleList,
    themeFromPalette, resolveTheme, sanitizeDesign, sanitizeCustomTheme,
    designV2Ready, designV2Info, referenceSearches, visionPrompt, slideContent,
    presetIsPoster, posterBlueprint,
    cardSetDensity, applyBlueprint, applyFontMixToKit, tuneKit, presetKit, blueprintKit,
    v2Cards, kitToJSON, kitFromJSON, drawCardCommands,
    DEFAULT_FONT_MIX, DEFAULT_GRAIN,
    frameworkInput, buildFramework, buildFrameworkFrom, slidesFromFramework, beatsFromFramework, presetContent,

    /* AI 브리지 */
    BRIDGE_PROVIDERS, BRIDGE_KINDS, GEMINI_DEFAULT_MODEL,
    bridgeContentBrief, buildBridgePrompt, parseBridgeAnswer,
    applyBridgeSlides, applyBridgeScript,
    geminiEndpoint, parseGeminiResponse, geminiErrorText,
  };
});
