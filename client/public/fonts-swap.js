// Applies the Google Fonts stylesheet once it's loaded, without an inline
// event handler (which the app's CSP blocks under script-src-attr). This
// replaces the old <link ... onload="this.media='all'"> trick with the
// same non-blocking behavior via an external, same-origin script.
(function () {
  var link = document.getElementById("fonts-stylesheet");
  if (!link) return;

  function applyStylesheet() {
    link.media = "all";
  }

  // If the stylesheet already finished loading before this script ran
  // (it's a high-priority resource, so this can happen), link.sheet will
  // already be populated — apply immediately instead of waiting for a
  // 'load' event that already fired.
  if (link.sheet) {
    applyStylesheet();
  } else {
    link.addEventListener("load", applyStylesheet, { once: true });
  }
})();
