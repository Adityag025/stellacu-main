/*
 * Shared header/footer include.
 *
 * Replaces every <div data-include="name"></div> on the page with the
 * contents of partials/name.html. {{root}} inside a partial becomes the
 * relative path back to the site root ("" or "../"), taken from this
 * script's own src, so the same partial works at any folder depth.
 *
 * The requests are synchronous on purpose: this script sits just before
 * libs.min.js and app.js, and app.js binds to the menu, header, color
 * switcher and footer as soon as it runs (some of it on DOMContentLoaded
 * and window load). Loading the partials first keeps that timing exactly
 * as it was when the markup lived in each page.
 *
 * Needs a server with clean URLs: Vercel, `npm run serve` or `vercel dev`;
 * browsers block these requests for pages opened directly from disk.
 */
(function () {
  var script = document.currentScript;
  var root = script.getAttribute('src').replace(/js\/include\.js(\?.*)?$/, '');
  var slots = document.querySelectorAll('[data-include]');

  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    // No ".html": the site uses clean URLs (vercel.json), which would
    // otherwise redirect every partial request before serving it.
    var url = root + 'partials/' + slot.getAttribute('data-include');
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        slot.outerHTML = xhr.responseText.replace(/\{\{root\}\}/g, root);
      } else {
        console.error('include.js: ' + url + ' returned ' + xhr.status);
      }
    } catch (e) {
      console.error('include.js: could not load ' + url + ' (open the site through a web server, not file://)', e);
    }
  }
})();
