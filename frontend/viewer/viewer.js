(function () {
  "use strict";

  var root = document.getElementById("caption-root");
  var box = document.getElementById("caption-box");
  var textEl = document.getElementById("caption-text");

  var HIDE_AFTER_MS = 6000; // how long a caption stays up if no new one arrives
  var hideTimer = null;

  function showCaption(text) {
    if (!text) return;
    textEl.textContent = text;
    box.classList.remove("hidden");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      box.classList.add("hidden");
    }, HIDE_AFTER_MS);
  }

  function applyStyleConfig(cfg) {
    if (!cfg) return;
    root.classList.toggle("pos-top", cfg.position === "top");
    root.classList.remove("size-small", "size-large");
    if (cfg.fontSize === "small") root.classList.add("size-small");
    if (cfg.fontSize === "large") root.classList.add("size-large");
  }

  function readBroadcasterConfig() {
    try {
      var seg = window.Twitch.ext.configuration.broadcaster;
      if (seg && seg.content) {
        applyStyleConfig(JSON.parse(seg.content));
      }
    } catch (e) {
      // no config saved yet — defaults are fine
    }
  }

  window.Twitch.ext.onAuthorized(function () {
    // Nothing required from the JWT here; the overlay is read-only for viewers.
    // We still wait for onAuthorized before listening, per Twitch's guidance.
    window.Twitch.ext.listen("broadcast", function (target, contentType, message) {
      var data;
      try {
        data = JSON.parse(message);
      } catch (e) {
        return; // ignore malformed payloads
      }
      if (data && typeof data.text === "string") {
        showCaption(data.text);
      }
    });
  });

  window.Twitch.ext.configuration.onChanged(readBroadcasterConfig);
  readBroadcasterConfig();
})();
