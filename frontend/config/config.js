(function () {
  "use strict";

  var positionEl = document.getElementById("position");
  var fontSizeEl = document.getElementById("fontSize");
  var saveBtn = document.getElementById("save");
  var statusEl = document.getElementById("status");

  function loadExisting() {
    try {
      var seg = window.Twitch.ext.configuration.broadcaster;
      if (seg && seg.content) {
        var cfg = JSON.parse(seg.content);
        if (cfg.position) positionEl.value = cfg.position;
        if (cfg.fontSize) fontSizeEl.value = cfg.fontSize;
      }
    } catch (e) {
      // fine — just use defaults
    }
  }

  function save() {
    var cfg = {
      position: positionEl.value,
      fontSize: fontSizeEl.value
    };
    // "1" is a version string — bump it if you ever change the config shape.
    window.Twitch.ext.configuration.set("broadcaster", "1", JSON.stringify(cfg));
    statusEl.textContent = "Salvat.";
    setTimeout(function () {
      statusEl.textContent = "";
    }, 2000);
  }

  window.Twitch.ext.onAuthorized(function () {
    loadExisting();
  });

  saveBtn.addEventListener("click", save);
})();
