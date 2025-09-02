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
      const topMid = (a.top + a.bottom) / 2;
      const botMid = (b.top + b.bottom) / 2;

      // Half-pixel snap for crisp alignment on fractional device pixels
      const hp = (n) => Math.round(n * 2) / 2;
      const shift = Math.max(0, hp((botMid - topMid) / 2)); // symmetric meet

      // Restore state and write the CSS variable used by the CSS translation
      if (wasAtEnd) wrapper.classList.add("is-at-end");
      wrapper.style.setProperty("--ind-merge-shift", `${shift}px`);
    }

    function calcAll() {
      wrappers.forEach(calcShift);
    }

    // IntersectionObserver sentinel for rock-solid end detection
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
        io = new IntersectionObserver((entries) => {
          const e = entries[0];
          if (!e) return;
          sentinelAtEnd = !!e.isIntersecting;
          updateEndClass();
        }, {
          // Respect iOS home-indicator safe area just in case
          rootMargin: '0px 0px calc(env(safe-area-inset-bottom,0) + 1px) 0px',
          threshold: 0.999
        });
        io.observe(s);
      }
    }

    function updateEndClass() {
      const on = sentinelAtEnd || isAtPageEnd();
      wrappers.forEach((w) => w.classList.toggle('is-at-end', on));
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