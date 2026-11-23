/* ============================================================
   카드뉴스·대본 스튜디오 · toast.js
   하단 알림 토스트 한 곳에서 관리.
   - 새 알림은 이전 알림을 즉시 지우고 자리를 바꾼다(항상 1개).
   - life(기본 2400ms) 뒤 스스로 사라지고 DOM에서 제거된다.
   - 연속 호출은 타이머를 새로 잡아 마지막 알림 기준으로 다시 센다.
   - 토스트를 누르면(클릭·탭) 바로 닫힌다.
   DOM·타이머는 주입할 수 있어 node 단위 테스트에서 그대로 쓴다.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioToast = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIFE = 2400; // 표시 시간(ms)
  var FADE = 220;  // 사라지는 애니메이션 시간(ms)

  function create(rootEl, options) {
    var opts = options || {};
    var doc = opts.document || (rootEl && rootEl.ownerDocument) ||
      (typeof document !== 'undefined' ? document : null);
    var life = typeof opts.life === 'number' ? opts.life : LIFE;
    var fade = typeof opts.fade === 'number' ? opts.fade : FADE;
    var setT = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    var clearT = opts.clearTimeout || function (id) { clearTimeout(id); };

    var current = null;
    var hideTimer = 0;
    var removeTimer = 0;
    var avoid = opts.avoid || []; // 이 영역들(하단 액션 버튼 등)과 겹치면 위로 비켜선다

    function resetPlace() {
      if (rootEl && rootEl.style) rootEl.style.transform = 'translate(-50%, 0)';
    }

    function clearTimers() {
      if (hideTimer) { clearT(hideTimer); hideTimer = 0; }
      if (removeTimer) { clearT(removeTimer); removeTimer = 0; }
    }

    function drop() {
      clearTimers();
      if (current && current.parentNode) current.parentNode.removeChild(current);
      current = null;
      resetPlace();
    }

    function overlapShift(el) {
      if (!avoid.length || !el.getBoundingClientRect || !doc.querySelectorAll) return 0;
      var tr = el.getBoundingClientRect();
      if (!tr || (!tr.width && !tr.height)) return 0;
      var shift = 0;
      avoid.forEach(function (sel) {
        var nodes = doc.querySelectorAll(sel);
        Array.prototype.forEach.call(nodes, function (node) {
          var r = node.getBoundingClientRect();
          if (!r || (!r.width && !r.height)) return;
          var hit = tr.bottom > r.top && tr.top < r.bottom && tr.right > r.left && tr.left < r.right;
          if (hit) shift = Math.max(shift, tr.bottom - r.top + 10);
        });
      });
      return Math.round(shift);
    }

    function dismiss() {
      if (!current) { clearTimers(); return; }
      var el = current;
      if (hideTimer) { clearT(hideTimer); hideTimer = 0; }
      if (el.classList) el.classList.add('is-out');
      if (el.setAttribute) el.setAttribute('aria-hidden', 'true');
      if (removeTimer) clearT(removeTimer);
      removeTimer = setT(function () {
        removeTimer = 0;
        if (el.parentNode) el.parentNode.removeChild(el);
        if (current === el) current = null;
        if (!current) resetPlace();
      }, fade);
    }

    function show(message, kind) {
      if (!rootEl || !doc) return null;
      drop(); // 이전 알림은 남기지 않는다 → 화면에는 항상 1개
      var el = doc.createElement('div');
      el.className = 'toast' + (kind ? ' ' + kind : '');
      el.textContent = String(message == null ? '' : message);
      if (el.setAttribute) {
        el.setAttribute('role', 'status');
        el.setAttribute('title', '눌러서 닫기');
      }
      if (el.addEventListener) {
        el.addEventListener('click', function () { dismiss(); });
      }
      rootEl.appendChild(el);
      current = el;
      resetPlace();
      var shift = overlapShift(el);
      if (shift > 0 && rootEl.style) rootEl.style.transform = 'translate(-50%, -' + shift + 'px)';
      hideTimer = setT(function () {
        hideTimer = 0;
        dismiss();
      }, life);
      return el;
    }

    return {
      show: show,
      dismiss: dismiss,
      destroy: drop,
      count: function () { return rootEl ? rootEl.children.length : 0; },
      active: function () { return current; },
      life: life,
      fade: fade,
    };
  }

  return { create: create, LIFE: LIFE, FADE: FADE };
});
