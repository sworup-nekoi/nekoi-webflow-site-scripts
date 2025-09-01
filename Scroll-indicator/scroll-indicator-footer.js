

(function () {
  if (window.__scrollIndicatorsInit) return;
  window.__scrollIndicatorsInit = true;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  ready(function () {
    const root = document.documentElement;
    const AT_END_PAD = 2; // px tolerance so it feels responsive

    let wrappers = [];

    function queryWrappers() {
      wrappers = Array.from(document.querySelectorAll(".indicator-wrapper"));
    }

    function isAtPageEnd() {
      const scrollY = window.scrollY || window.pageYOffset;
      const viewH = window.innerHeight || root.clientHeight;
      const docH = Math.max(
        root.scrollHeight,
        root.offsetHeight,
        root.clientHeight,
        document.body ? Math.max(document.body.scrollHeight, document.body.offsetHeight) : 0
      );
      return scrollY + viewH >= docH - AT_END_PAD;
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

    function updateEndClass() {
      const on = isAtPageEnd();
      wrappers.forEach((w) => w.classList.toggle("is-at-end", on));
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
        const on = isAtPageEnd();
        wrappers.forEach((w) => w.classList.toggle("is-at-end", on));
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