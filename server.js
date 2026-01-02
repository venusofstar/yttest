const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const http = require("http");
const https = require("https");
const { PassThrough } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.raw({ type: "*/*" }));

// =========================
// KEEP-ALIVE AGENTS
// =========================
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200, keepAliveMsecs: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200, keepAliveMsecs: 30000 });

// =========================
// ORIGINS
// =========================
const ORIGINS = [
  "http://143.44.136.67:6060",
  "http://136.239.158.18:6610"
];

// =========================
// PER-CHANNEL SESSION
// =========================
const channelSessions = new Map();

function createSession(channelId) {
  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    startNumber: 46489952 + Math.floor(Math.random() * 100000) * 6,
    IAS: generateIAS(),
    userSession: generateUserSession(),
    ztecid: `ch0000009099000000${channelId}${Math.floor(Math.random() * 9000 + 1000)}`
  };
}

function getSession(channelId) {
  if (!channelSessions.has(channelId)) {
    channelSessions.set(channelId, createSession(channelId));
  }
  return channelSessions.get(channelId);
}

function rotateOrigin(session) {
  session.originIndex = (session.originIndex + 1) % ORIGINS.length;
}

// =========================
// SESSION ID GENERATORS
// =========================
function generateIAS() {
  return "RR" + Date.now() + Math.random().toString(36).slice(2, 10);
}

function generateUserSession() {
  return Math.floor(Math.random() * 1e15).toString();
}

// Rotate session IDs every 20 seconds for all active channels
setInterval(() => {
  channelSessions.forEach(session => {
    session.IAS = generateIAS();
    session.userSession = generateUserSession();
  });
}, 20_000);

// Cleanup sessions every 10 minutes
setInterval(() => channelSessions.clear(), 10 * 60_000);

// =========================
// FETCH WITH STICKY ORIGIN
// =========================
async function fetchSticky(urlBuilder, req, session) {
  for (let attempt = 0; attempt < ORIGINS.length; attempt++) {
    const origin = ORIGINS[session.originIndex];
    const url = urlBuilder(origin);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);

      const res = await fetch(url, {
        agent: url.startsWith("https") ? httpsAgent : httpAgent,
        headers: {
          "User-Agent": req.headers["user-agent"] || "OTT",
          "Accept": "*/*",
          "Connection": "keep-alive"
        },
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      console.error("⚠️ Origin failed:", ORIGINS[session.originIndex], err.message);
      rotateOrigin(session);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  throw new Error("All origins failed");
}

// =========================
// AUTH PARAMS BUILDER
// =========================
function getAuthParams(session) {
  return [
    "JITPDRMType=Widevine",
    "virtualDomain=001.live_hls.zte.com",
    "m4s_min=1",
    "JITPDRMType=NO",
    "isjitp=0",
    `startNumber=${session.startNumber}`,
    "filedura=6",
    "ispcode=55",
    `IASHttpSessionId=${session.IAS}`,
    `usersessionid=${session.userSession}`,
    `ztecid=${session.ztecid}`
  ].join("&");
}

// =========================
// LIVE CHECK
// =========================
function isLiveSegment(path) {
  return path.endsWith(".m4s");
}

// =========================
// STREAM SEGMENT WITH NON-BLOCKING DELAY
// =========================
async function streamSegment(upstream, res, path) {
  const proxyStream = new PassThrough();
  proxyStream.pipe(res);

  const STALL_LIMIT = 3_000;
  let lastChunk = Date.now();

  const stallTimer = setInterval(() => {
    if (Date.now() - lastChunk > STALL_LIMIT) {
      console.warn("⚠️ Segment stall detected, rotating origin...");
      proxyStream.end();
      upstream.body.destroy();
    }
  }, 500);

  const isLive = isLiveSegment(path);

  try {
    for await (const chunk of upstream.body) {
      lastChunk = Date.now();

      if (isLive) {
        // Non-blocking 3-second delay for live segments
        setTimeout(() => proxyStream.write(chunk), 3000);
      } else {
        proxyStream.write(chunk);
      }
    }
  } catch (err) {
    console.warn("⚠️ Stream error:", err.message);
  } finally {
    clearInterval(stallTimer);
    proxyStream.end();
  }
}

// =========================
// HOME PAGE
// =========================
app.get("/", (_, res) => {
  res.send(`
    <html>
      <head>
        <title>Star Of Venus</title>
        <style>
          body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #000; font-family: Arial, sans-serif; }
          h1 { font-size: 4rem; text-transform: uppercase; background: linear-gradient(270deg, red, orange, yellow, green, blue, indigo, violet); background-size: 1400% 1400%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: rainbow 10s ease infinite; }
          @keyframes rainbow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        </style>
      </head>
      <body><h1>Star Of Venus</h1></body>
    </html>
  `);
});

// =========================
// DASH/HLS PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];
  const session = getSession(channelId);
  const authParams = getAuthParams(session);

  try {
    const upstream = await fetchSticky(origin => {
      const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
      return path.includes("?") ? `${base}${path}&${authParams}` : `${base}${path}?${authParams}`;
    }, req, session);

    if (path.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/${channelId}/`;
      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "").replace(/<MPD([^>]*)>/, `<MPD$1><BaseURL>${proxyBase}</BaseURL>`);
      res.set({ "Content-Type": "application/dash+xml", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
      return res.send(mpd);
    }

    res.set({ "Content-Type": "video/mp4", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Connection": "keep-alive" });
    await streamSegment(upstream, res, path);

  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(502).end();
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => console.log(`✅ DASH/HLS proxy running on port ${PORT}`));
