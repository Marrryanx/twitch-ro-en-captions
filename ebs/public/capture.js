(function () {
  "use strict";

  var dot = document.getElementById("dot");
  var toggleBtn = document.getElementById("toggle");
  var statusText = document.getElementById("statusText");
  var tokenInput = document.getElementById("token");
  var logEl = document.getElementById("log");
  var errorEl = document.getElementById("error");

  var STORAGE_KEY = "ro-en-captions:token";
  var MIN_SEND_INTERVAL_MS = 900; // client-side courtesy throttle; the EBS also enforces this

  var recognition = null;
  var listening = false; // user's intent (survives auto-restarts of the engine)
  var lastSentAt = 0;
  var interimRow = null;

  // ---------- small UI helpers ----------

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }

  function clearError() {
    errorEl.classList.add("hidden");
    errorEl.textContent = "";
  }

  function setListeningUI(isListening) {
    listening = isListening;
    dot.classList.toggle("live", isListening);
    toggleBtn.classList.toggle("active", isListening);
    toggleBtn.textContent = isListening ? "Oprește ascultarea" : "Pornește ascultarea";
    statusText.textContent = isListening ? "Ascult…" : "Oprit";
  }

  function appendLogRow(roText, enText) {
    if (interimRow) {
      interimRow.remove();
      interimRow = null;
    }
    var row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      '<div class="ro">RO: ' + escapeHtml(roText) + "</div>" +
      '<div class="en">EN: ' + escapeHtml(enText) + "</div>";
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showInterim(roText) {
    if (!interimRow) {
      interimRow = document.createElement("div");
      interimRow.className = "row interim";
      logEl.appendChild(interimRow);
    }
    interimRow.textContent = "… " + roText;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------- Token persistence ----------

  tokenInput.value = localStorage.getItem(STORAGE_KEY) || "";
  tokenInput.addEventListener("change", function () {
    localStorage.setItem(STORAGE_KEY, tokenInput.value.trim());
  });

  function getToken() {
    return tokenInput.value.trim();
  }

  // ---------- Translation (free, no API key: MyMemory) ----------

  function translateToEnglish(roText) {
    var url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(roText) +
      "&langpair=ro|en";
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
        throw new Error("Răspuns de traducere gol");
      });
  }

  // ---------- Send caption to EBS (same origin — this page is served BY the EBS) ----------

  function sendCaption(roText, enText) {
    var now = Date.now();
    if (now - lastSentAt < MIN_SEND_INTERVAL_MS) return;
    lastSentAt = now;

    var token = getToken();
    if (!token) {
      showError("Lipește mai întâi tokenul copiat din Live Config.");
      return;
    }

    fetch("/caption", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ text: enText, original: roText })
    })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          throw new Error(
            "Tokenul a expirat sau e invalid. Întoarce-te la Live Config, copiază unul nou și lipește-l aici."
          );
        }
        if (!r.ok) throw new Error("EBS a răspuns cu status " + r.status);
        clearError();
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  // ---------- Speech recognition ----------

  function getRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function createRecognition() {
    var Ctor = getRecognitionCtor();
    var rec = new Ctor();
    rec.lang = "ro-RO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = function (event) {
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var result = event.results[i];
        var roText = result[0].transcript.trim();
        if (!roText) continue;

        if (result.isFinal) {
          translateToEnglish(roText)
            .then(function (enText) {
              appendLogRow(roText, enText);
              sendCaption(roText, enText);
            })
            .catch(function (err) {
              showError("Traducerea a eșuat: " + err.message);
            });
        } else {
          showInterim(roText);
        }
      }
    };

    rec.onerror = function (event) {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showError("Accesul la microfon a fost refuzat. Permite-l din setările browserului.");
        setListeningUI(false);
        listening = false;
      } else if (event.error === "no-speech") {
        // benign — recognition will restart via onend
      } else {
        showError("Eroare de recunoaștere vocală: " + event.error);
      }
    };

    // Chrome's continuous mode still stops periodically on its own.
    // If the broadcaster hasn't clicked "Stop", just restart it.
    rec.onend = function () {
      if (listening) {
        try {
          recognition.start();
        } catch (e) {
          setTimeout(function () {
            if (listening) recognition.start();
          }, 300);
        }
      }
    };

    return rec;
  }

  function startListening() {
    var Ctor = getRecognitionCtor();
    if (!Ctor) {
      showError(
        "Browserul tău nu suportă Web Speech API. Folosește Chrome sau Edge pe desktop."
      );
      return;
    }
    if (!getToken()) {
      showError("Lipește mai întâi tokenul copiat din Live Config.");
      return;
    }

    clearError();

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
        recognition = createRecognition();
        recognition.start();
        setListeningUI(true);
      })
      .catch(function () {
        showError("Am nevoie de acces la microfon ca să pot asculta.");
      });
  }

  function stopListening() {
    listening = false;
    setListeningUI(false);
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
      recognition = null;
    }
  }

  toggleBtn.addEventListener("click", function () {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  });
})();
