(function () {
  "use strict";

  var ebsUrlInput = document.getElementById("ebsUrl");
  var tokenInput = document.getElementById("token");
  var copyBtn = document.getElementById("copyBtn");
  var copyStatus = document.getElementById("copyStatus");
  var openBtn = document.getElementById("openBtn");
  var errorEl = document.getElementById("error");

  var STORAGE_KEY = "ro-en-captions:ebsUrl";

  ebsUrlInput.value = localStorage.getItem(STORAGE_KEY) || "";
  ebsUrlInput.addEventListener("input", function () {
    localStorage.setItem(STORAGE_KEY, ebsUrlInput.value.trim());
    updateOpenButton();
  });

  function getEbsUrl() {
    return ebsUrlInput.value.trim().replace(/\/+$/, "");
  }

  function updateOpenButton() {
    openBtn.disabled = !getEbsUrl();
  }
  updateOpenButton();

  window.Twitch.ext.onAuthorized(function (auth) {
    // Twitch calls this again whenever it refreshes the token, so the
    // field always shows a currently-valid one as long as this tab stays open.
    tokenInput.value = auth.token;
  });

  copyBtn.addEventListener("click", function () {
    tokenInput.select();
    tokenInput.setSelectionRange(0, 99999);
    navigator.clipboard
      .writeText(tokenInput.value)
      .then(function () {
        copyStatus.textContent = "Copiat!";
        setTimeout(function () {
          copyStatus.textContent = "";
        }, 2000);
      })
      .catch(function () {
        copyStatus.textContent = "Textul e selectat — apasă Ctrl+C / Cmd+C.";
      });
  });

  openBtn.addEventListener("click", function () {
    var ebsUrl = getEbsUrl();
    if (!ebsUrl) return;
    window.open(ebsUrl + "/capture", "_blank");
  });
})();
