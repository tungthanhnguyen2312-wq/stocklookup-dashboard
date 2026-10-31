/* Stock Lookup — assets/js/glass-shell.js
 * GLASSY_SHELL_V1. Loaded in <head> (not deferred) so the view-transition hooks exist before
 * the first render of each page. Presentation only: no data, storage or navigation changes.
 *  1. Cross-page view transitions: view-transition-names are switched on (html.gs-vt) only
 *     while a transition runs; at rest they would isolate the glass from the scene behind it.
 *  2. Cơ hội tabs: a glass lens glides to the selected tab (same motion as the dock).
 *  3. Glass panels: the sheen follows the pointer on devices with a fine pointer.
 */
(function () {
  "use strict";
  var root = document.documentElement;

  window.addEventListener("pageswap", function (event) {
    if (event.viewTransition) root.classList.add("gs-vt");
  });
  window.addEventListener("pagereveal", function (event) {
    if (!event.viewTransition) return;
    root.classList.add("gs-vt");
    event.viewTransition.finished.finally(function () { root.classList.remove("gs-vt"); });
  });
  // A page restored from the back/forward cache must not keep the transition names.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) root.classList.remove("gs-vt");
  });

  function reducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function boxOf(el, parent) {
    var a = el.getBoundingClientRect();
    var c = parent.getBoundingClientRect();
    return { x: a.left - c.left - parent.clientLeft + parent.scrollLeft, y: a.top - c.top - parent.clientTop + parent.scrollTop, w: a.width, h: a.height };
  }

  // Moves a lens onto target; with a short liquid stretch when the move is animated.
  function glide(lens, target, animate) {
    var parent = lens.offsetParent;
    if (!parent || !target) return;
    var b = boxOf(target, parent);
    var prev = lens._gsBox;
    if (typeof lens.getAnimations === "function") lens.getAnimations().forEach(function (a) { a.cancel(); });
    lens.style.width = b.w + "px";
    lens.style.height = b.h + "px";
    lens.style.transform = "translate(" + b.x + "px, " + b.y + "px)";
    lens._gsBox = b;
    if (!prev || !animate || reducedMotion() || typeof lens.animate !== "function") return;
    var dx = b.x - prev.x;
    var dy = b.y - prev.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1 && Math.abs(prev.w - b.w) < 1) return;
    var s = Math.min(0.4, (dist / b.w) * 0.14);
    lens.animate([
      { transform: "translate(" + prev.x + "px, " + prev.y + "px)", width: prev.w + "px", height: prev.h + "px" },
      { transform: "translate(" + (prev.x + b.x) / 2 + "px, " + (prev.y + b.y) / 2 + "px) scale(" + (1 + s) + ", " + (1 - s * 0.45) + ")", width: (prev.w + b.w) / 2 + "px", height: (prev.h + b.h) / 2 + "px", offset: 0.45 },
      { transform: "translate(" + b.x + "px, " + b.y + "px)", width: b.w + "px", height: b.h + "px" },
    ], { duration: Math.min(620, 340 + dist * 0.6), easing: "cubic-bezier(.32,.72,.16,1)" });
  }

  function initTabLens() {
    var list = document.querySelector('.ws-view-tabs[role="tablist"]');
    if (!list || list.querySelector(".gs-tab-lens")) return;
    var lens = document.createElement("span");
    lens.className = "gs-tab-lens";
    lens.setAttribute("aria-hidden", "true");
    list.insertBefore(lens, list.firstChild);
    list.classList.add("gs-has-lens");
    function sync(animate) {
      var selected = list.querySelector('[role="tab"][aria-selected="true"]');
      if (selected && list.offsetParent) glide(lens, selected, animate);
    }
    sync(false);
    if (typeof MutationObserver === "function") {
      new MutationObserver(function () { sync(true); }).observe(list, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    }
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { lens._gsBox = null; sync(false); }, 120);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { lens._gsBox = null; sync(false); });
  }

  function initSheen() {
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var selector = ".vs-content .card, .vs-content .kpi, .vs-content .home-pulse";
    var pending = 0;
    document.addEventListener("pointermove", function (event) {
      var el = event.target && event.target.closest ? event.target.closest(selector) : null;
      if (!el || pending) return;
      pending = window.requestAnimationFrame(function () {
        pending = 0;
        var r = el.getBoundingClientRect();
        el.style.setProperty("--gs-mx", (event.clientX - r.left) + "px");
        el.style.setProperty("--gs-my", (event.clientY - r.top) + "px");
      });
    }, { passive: true });
    document.addEventListener("pointerout", function (event) {
      var el = event.target && event.target.closest ? event.target.closest(selector) : null;
      if (el && !el.contains(event.relatedTarget)) {
        el.style.removeProperty("--gs-mx");
        el.style.removeProperty("--gs-my");
      }
    });
  }

  function init() {
    initTabLens();
    initSheen();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  if (typeof module === "object" && module.exports) module.exports = { glide: glide };
})();
