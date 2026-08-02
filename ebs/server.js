// Extension Backend Service (EBS) for the RO→EN live captions extension.
//
// Responsibilities:
//   1. Verify the JWT that Twitch issued to the broadcaster's Live Config iframe.
//   2. Accept a translated caption from the broadcaster's browser.
//   3. Re-broadcast it to every viewer's extension instance via Twitch's
//      Extension PubSub, signing a fresh JWT with the extension's shared secret.
//
// Docs this was built against:
//   https://dev.twitch.tv/docs/extensions/building/#creating-your-extension-backend-service-ebs
//   https://dev.twitch.tv/docs/api/reference/#send-extension-pubsub-message
// APIs like this do shift over time — if auth calls start failing, diff this
// file against the current reference page before anything else.

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const {
  EXTENSION_CLIENT_ID,
  EXTENSION_SECRET,
  EXTENSION_OWNER_ID,
  ALLOWED_ORIGIN,
  PORT
} = process.env;

for (const [name, value] of Object.entries({
  EXTENSION_CLIENT_ID,
  EXTENSION_SECRET,
  EXTENSION_OWNER_ID
})) {
  if (!value) {
    console.error(`Missing required env var: ${name} (see .env.example)`);
    process.exit(1);
  }
}

const secretBuffer = Buffer.from(EXTENSION_SECRET, "base64");
const app = express();

app.use(express.json());
app.use(
  cors({
    origin: ALLOWED_ORIGIN || "*"
  })
);

// ---------- JWT verification (incoming, from the broadcaster's iframe) ----------

function verifyBroadcasterJwt(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let payload;
  try {
    payload = jwt.verify(token, secretBuffer, { algorithms: ["HS256"] });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token: " + err.message });
  }

  // Only the broadcaster (not a random viewer) may push captions.
  if (payload.role !== "broadcaster") {
    return res.status(403).json({ error: "Only the broadcaster can send captions" });
  }

  req.channelId = payload.channel_id;
  next();
}

// ---------- Outgoing JWT (EBS -> Twitch API) ----------

function signExternalJwt(channelId) {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 30,
    user_id: EXTENSION_OWNER_ID,
    role: "external",
    channel_id: channelId,
    pubsub_perms: { send: ["broadcast"] }
  };
  return jwt.sign(payload, secretBuffer, { algorithm: "HS256" });
}

async function sendPubSubMessage(channelId, messageObj) {
  const token = signExternalJwt(channelId);
  const body = {
    target: ["broadcast"],
    broadcaster_id: channelId,
    is_global_broadcast: false,
    message: JSON.stringify(messageObj)
  };

  const res = await fetch("https://api.twitch.tv/helix/extensions/pubsub", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Client-Id": EXTENSION_CLIENT_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twitch PubSub API returned ${res.status}: ${text}`);
  }
}

// ---------- Per-channel throttling (Twitch allows 1 msg/sec/channel) ----------

const SEND_INTERVAL_MS = 1100;
const channelQueues = new Map(); // channelId -> array of message objects
const channelTimers = new Map(); // channelId -> interval handle

function enqueueCaption(channelId, messageObj) {
  if (!channelQueues.has(channelId)) channelQueues.set(channelId, []);
  const queue = channelQueues.get(channelId);

  queue.push(messageObj);
  if (queue.length > 5) queue.shift(); // drop stale backlog, keep it live

  if (!channelTimers.has(channelId)) {
    drainChannel(channelId); // send the first one immediately
    channelTimers.set(channelId, setInterval(() => drainChannel(channelId), SEND_INTERVAL_MS));
  }
}

function drainChannel(channelId) {
  const queue = channelQueues.get(channelId);
  if (!queue || queue.length === 0) {
    clearInterval(channelTimers.get(channelId));
    channelTimers.delete(channelId);
    return;
  }
  const next = queue.shift();
  sendPubSubMessage(channelId, next).catch((err) => {
    console.error(`PubSub send failed for channel ${channelId}:`, err.message);
  });
}

// ---------- Routes ----------

// The standalone capture console (public/capture.html + .css + .js) has to be
// a normal, non-embedded page: Twitch's Live Config runs in a cross-origin
// iframe, and browsers refuse microphone access there unless Twitch's own
// embedding grants it — which it doesn't. So the broadcaster copies a token
// from Live Config and pastes it here, in a plain browser tab, where
// getUserMedia works normally.
app.use(express.static(path.join(__dirname, "public")));
app.get("/capture", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "capture.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/caption", verifyBroadcasterJwt, (req, res) => {
  const text = typeof req.body.text === "string" ? req.body.text.trim().slice(0, 500) : "";
  const original =
    typeof req.body.original === "string" ? req.body.original.trim().slice(0, 500) : "";

  if (!text) {
    return res.status(400).json({ error: "Missing 'text' field" });
  }

  enqueueCaption(req.channelId, { text, original, ts: Date.now() });
  res.status(202).json({ queued: true });
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`EBS listening on port ${port}`);
});
