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
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 200,
  keepAliveMsecs: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 200,
  keepAliveMsecs: 30000
});

// =========================
// ORIGINS
// =========================
const ORIGINS = [
  "http://136.239.158.30:6610",
  "http://136.158.97.2:6610",
  "http://136.239.173.10:6610"
];

// =========================
// PER-CHANNEL SESSION
// =========================
const channelSessions = new Map();

function createSession(channelId) {
  const ztecid = `ch0000009099000000${channelId}${Math.floor(Math.random() * 9000 + 1000)}`;

  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    nextOriginIndex: null, // 🔥 queued rotation

    startNumber: 46489952 + Math.floor(Math.random() * 100000) * 6,
    IAS: "RR" + Date.now() + Math.random().toString(36).slice(2, 10),
    userSession: Math.floor(Math.random() * 1e15).toString(),
    ztecid,

    rotateTimer: null,
    lastActive: Date.now()
  };
}

function getSession(channelId) {
  if (!channelSessions.has(channelId)) {
    channelSessions.set(channelId, createSession(channelId));
  }
  return channelSessions.get(channelId);
}

// =========================
// SAFE AUTO ROTATION (NO BUFFER)
// =========================
function startAutoRotate(session) {
  if (session.rotateTimer) return;

  session.rotateTimer = setInterval(() => {
    session.nextOriginIndex =
      (session.originIndex + 1) % ORIGINS.length;

    console.log("🔄 Origin queued:", ORIGINS[session.nextOriginIndex]);
  }, 6000);
}

function stopAutoRotate(session) {
  if (session.rotateTimer) {
    clearInterval(session.rotateTimer);
    session.rotateTimer = null;
  }
}

// Stop rotation when inactive
setInterval(() => {
  const now = Date.now();

  for (const [channelId, session] of channelSessions.entries()) {
    if (now - session.lastActive > 15000) {
      stopAutoRotate(session);
    }
  }
}, 5000);

// Cleanup sessions
setInterval(() => channelSessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH STICKY ORIGIN
// =========================
async function fetchSticky(urlBuilder, req, session) {
  const origin = ORIGINS[session.originIndex];
  const url = urlBuilder(origin);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
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
    clearTimeout(timeout);
    throw err;
  }
}

// =========================
// HOME
// =========================
app.get("/", (_, res) => {
  res.send("Star Of Venus");
});

// =========================
// DASH / HLS PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];
  const session = getSession(channelId);

  // Mark activity + start rotation
  session.lastActive = Date.now();
  startAutoRotate(session);

  // ✅ Apply queued rotation SAFELY (before fetch)
  if (session.nextOriginIndex !== null) {
    session.originIndex = session.nextOriginIndex;
    session.nextOriginIndex = null;
    console.log("✅ Origin switched:", ORIGINS[session.originIndex]);
  }

  const authParams =
    `JITPDRMType=Widevine` +
    `&virtualDomain=001.live_hls.zte.com` +
    `&m4s_min=1` +
    `&JITPDRMType=NO` +
    `&isjitp=0` +
    `&startNumber=${session.startNumber}` +
    `&filedura=10` +
    `&ispcode=55` +
    `&IASHttpSessionId=${session.IAS}` +
    `&usersessionid=${session.userSession}` +
    `&ztecid=${session.ztecid}`;

  try {
    const upstream = await fetchSticky(origin => {
      const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
      return path.includes("?")
        ? `${base}${path}&${authParams}`
        : `${base}${path}?${authParams}`;
    }, req, session);

    // =========================
    // MPD
    // =========================
    if (path.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/${channelId}/`;

      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "");
      mpd = mpd.replace(
        /<MPD([^>]*)>/,
        `<MPD$1><BaseURL>${proxyBase}</BaseURL>`
      );

      res.set({
        "Content-Type": "application/dash+xml",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });

      return res.send(mpd);
    }

    // =========================
    // SEGMENTS
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    });

    const proxyStream = new PassThrough();
    upstream.body.pipe(proxyStream).pipe(res);

    upstream.body.on("error", () => {
      proxyStream.end();
    });

  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(502).end();
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`✅ DASH/HLS proxy running on port ${PORT}`);
});
