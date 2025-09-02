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

      // Helper: find edges using *thinnest* visible descendants (works with responsive sizes)
      function thinEdges(root) {
        const nodes = Array.from(root.querySelectorAll('*'));
        if (!nodes.length) return null;
        let minH = Infinity;
        const rects = [];
        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          const h = r.height;
          if (h > 0) {
            rects.push(r);
            if (h < minH) minH = h;
          }
        }
        if (!rects.length || !Number.isFinite(minH)) return null;
        // Keep elements within ~10% of the thinnest height (likely the bars)
        const tol = minH * 1.1;
        const thin = rects.filter(r => r.height <= tol);
        return {
          topMin: Math.min.apply(null, thin.map(r => r.top)),
          bottomMax: Math.max.apply(null, thin.map(r => r.bottom))
        };
      }

      const topThin = thinEdges(topWrap);
      const botThin = thinEdges(bottom);

      // Prefer thin-descendant edges; fall back to container edges
      const topBottom = topThin ? topThin.bottomMax : a.bottom;
      let bottomTop = botThin ? botThin.topMin : b.top;

      // Snap to the device-pixel grid to avoid fractional wobble on mobile
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
      const snap = (n) => Math.round(n * dpr) / dpr;

      const gap = bottomTop - topBottom; // positive gap between rows
      const shiftTop = Math.max(0, snap(gap)); // move ONLY the top row by the full gap

      // Restore state and write the CSS variables used by the CSS translation
      if (wasAtEnd) wrapper.classList.add("is-at-end");
      // For compatibility, keep --ind-merge-shift equal to the top shift
      wrapper.style.setProperty("--ind-merge-shift", `${shiftTop}px`);
      wrapper.style.setProperty("--ind-merge-shift-top", `${shiftTop}px`);
      wrapper.style.setProperty("--ind-merge-shift-bottom", `0px`);
    }

    function calcAll() {
      wrappers.forEach(calcShift);
    }

    // IntersectionObserver sentinel for rock-solid end detection
    // (Removed per instructions)

    function updateEndClass() {
      const on = isAtPageEnd();
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
      // ensureSentinel();  // Removed per instructions
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