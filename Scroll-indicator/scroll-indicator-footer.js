(function () {
  if (window.__scrollIndicatorsInit) return;
  window.__scrollIndicatorsInit = true;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  ready(function () {
    const root = document.documentElement;

    const scroller = document.scrollingElement || document.documentElement;

    // Use visual viewport when available to avoid mobile URL-bar drift
    function viewportH() {
      return (window.visualViewport && window.visualViewport.height) ||
             window.innerHeight ||
             root.clientHeight;
    }

    function docH() {
      return Math.max(
        scroller.scrollHeight,
        root.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
    }

    function scrollTop() {
      return (typeof window.scrollY === 'number' ? window.scrollY : scroller.scrollTop) || 0;
    }

    const AT_END_PAD = 2; // px tolerance so it feels responsive

    let wrappers = [];

    function queryWrappers() {
      wrappers = Array.from(document.querySelectorAll(".indicator-wrapper"));
    }

    function isAtPageEnd() {
      const st = scrollTop();
      const vh = viewportH();
      const sh = docH();

      const max = Math.max(1, sh - vh);
      // Snap when within a few pixels to kill wobble from URL bar / rubber-band
      const thresholdPx = 3; // tune if needed
      if (max - st <= thresholdPx) return true;

      return st >= max;
    }

    // Compute how far the rows must move to meet in a straight line
    // Always measure in the *resting* (non-merged) state
    function calcShift(wrapper) {
      const topWrap = wrapper.querySelector(".indicator-top-wrapper");
      if (!topWrap) return;

      // "Bottom" indicator = any .indicator in wrapper not inside topWrap
      const bottom = Array.from(wrapper.querySelectorAll(".indicator")).find((el) => !topWrap.contains(el));
      if (!bottom) return;

      // If currently at the bottom, temporarily remove the merge class so
      // measurements are taken from the un-transformed (resting) layout.
      const wasAtEnd = wrapper.classList.contains("is-at-end");
      if (wasAtEnd) wrapper.classList.remove("is-at-end");

      // Read geometry without transforms applied
      const a = topWrap.getBoundingClientRect();
      const b = bottom.getBoundingClientRect();
      const topBottom = a.bottom;
      const bottomTop = b.top;

      // Snap to the device-pixel grid to avoid fractional wobble on mobile
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
      const snap = (n) => Math.round(n * dpr) / dpr;

      const gap = bottomTop - topBottom; // positive gap between rows
      const shift = Math.max(0, snap(gap / 2)); // symmetric meet

      // Restore state and write the CSS variable used by the CSS translation
      if (wasAtEnd) wrapper.classList.add("is-at-end");
      wrapper.style.setProperty("--ind-merge-shift", `${shift}px`);
    }

    function calcAll() {
      wrappers.forEach(calcShift);
    }

    // After we toggle the end state, measure transformed positions and micro-adjust
    function microAdjust(wrapper) {
      const topWrap = wrapper.querySelector('.indicator-top-wrapper');
      if (!topWrap) return;
      const bottom = Array.from(wrapper.querySelectorAll('.indicator')).find((el) => !topWrap.contains(el));
      if (!bottom) return;

      // Only adjust when merged
      if (!wrapper.classList.contains('is-at-end')) return;

      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
      const snap = (n) => Math.round(n * dpr) / dpr;
      const eps = 0.5 / dpr; // ignore sub-half-pixel noise

      // Current variable value
      const cs = getComputedStyle(wrapper);
      const current = parseFloat(cs.getPropertyValue('--ind-merge-shift')) || 0;

      // Measure AFTER transforms are applied
      const aBottom = topWrap.getBoundingClientRect().bottom;
      const bTop = bottom.getBoundingClientRect().top;
      const error = bTop - aBottom; // +gap / -overlap

      if (Math.abs(error) <= eps) return;

      const adjusted = snap(current + error / 2);
      wrapper.style.setProperty('--ind-merge-shift', `${adjusted}px`);
    }

    function microAdjustAll() {
      wrappers.forEach(microAdjust);
    }

    // IntersectionObserver sentinel for rock-solid end detection
    let endWasOn = false;
    let sentinelAtEnd = false;
    let io = null;
    function ensureSentinel() {
      if (!document.body) return;
      let s = document.getElementById('scroll-end-sentinel-js');
      if (!s) {
        s = document.createElement('div');
        s.id = 'scroll-end-sentinel-js';
        // Tiny block that sits at the very end of the document flow
        s.style.cssText = 'height:1px;width:1px;';
        document.body.appendChild(s);
      }
      if ('IntersectionObserver' in window) {
        if (io) io.disconnect();

        // Read CSS var safely (falls back to 0px if missing)
        function getSafeBottomPx() {
          try {
            const cs = getComputedStyle(document.documentElement);
            const v = (cs.getPropertyValue('--safe-bottom') || '0px').trim();
            const n = parseFloat(v);
            return Number.isFinite(n) ? n : 0;
          } catch (_) {
            return 0;
          }
        }

        const bottomPad = Math.max(1, Math.round(getSafeBottomPx()) + 1); // ensure >=1px

        try {
          io = new IntersectionObserver(
            (entries) => {
              const e = entries[0];
              if (!e) return;
              sentinelAtEnd = !!e.isIntersecting;
              updateEndClass();
            },
            {
              // IntersectionObserver requires px or % — build a px string
              rootMargin: `0px 0px ${bottomPad}px 0px`,
              threshold: 0.999,
            }
          );
          io.observe(s);
        } catch (err) {
          console.warn('IntersectionObserver init failed; falling back', err);
          io = null; // fallback to math-only end detection
        }
      }
    }

    function updateEndClass() {
      const on = sentinelAtEnd || isAtPageEnd();

      // Recompute shifts when entering end state (pre-transform metrics)
      if (on && !endWasOn) {
        calcAll();
      }

      wrappers.forEach((w) => w.classList.toggle('is-at-end', on));

      // After the CSS transition finishes, measure transformed positions once and micro-correct
      // Use a small timer close to --ind-merge-in (260ms) with cushion
      if (on) {
        clearTimeout(updateEndClass._t);
        updateEndClass._t = setTimeout(() => {
          microAdjustAll();
        }, 320);
      }

      endWasOn = on;
    }

    // Robust scheduling
    let queued = false;

    function scheduleAll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        calcAll();
        updateEndClass();
      });
    }

    function settleAll() {
      queryWrappers();
      ensureSentinel();
      // run now and again after a couple of frames for safety
      scheduleAll();
      setTimeout(scheduleAll, 50);
      setTimeout(scheduleAll, 200);
    }

    // Initial run
    settleAll();

    // Observe layout changes across relevant nodes
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => settleAll());
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }

    // Global events that can change the effective viewport or layout
    window.addEventListener("resize", settleAll, { passive: true });
    window.addEventListener("orientationchange", settleAll, { passive: true });
    window.addEventListener("load", settleAll, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") settleAll();
    });

    // visualViewport catches device emulation changes, zoom, on-screen keyboard, etc.
    if (window.visualViewport) {
      visualViewport.addEventListener("resize", settleAll, { passive: true });
      visualViewport.addEventListener("scroll", settleAll, { passive: true });
    }

    // Scroll only needs the end/not-end toggle
    window.addEventListener(
      "scroll",
      () => {
        updateEndClass();
      },
      { passive: true }
    );

    // Fonts loading can change metrics → recalc once ready
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(settleAll).catch(() => {});
    }

    // SPA hook: re-scan and recalc when content is swapped
    document.addEventListener("spa:ready", settleAll);

    // Expose a manual refresh hook (optional)
    window.ScrollIndicators = window.ScrollIndicators || {};
    window.ScrollIndicators.refresh = settleAll;
  });
})();