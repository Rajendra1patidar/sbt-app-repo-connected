// Sets the saved (or the phone's) light/dark theme before the first paint, so the page never
// flashes the wrong colours. This used to be an inline <script> in index.html; it is a file now so
// the Content-Security-Policy can say script-src 'self' without allowing inline scripts.
// It must stay a plain, blocking script (no type="module", no defer) to run before anything is drawn.
(function () {
  try {
    var saved = localStorage.getItem("sbt_theme");
    var theme = saved === "dark" || saved === "light"
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
