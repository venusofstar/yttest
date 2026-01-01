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
  "http://143.44.136.67:6060"
];

// =========================
// CHANNEL SESSIONS
// =========================
const sessions = new Map();

function createSession(channelId) {
  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    startNumber: 46000000 + Math.floor(Math.random() * 100000) * 6,
    IAS: "RR" + Date.now() + Math.random().toString(36).slice(2, 8),
    userSession: Math.floor(Math.random() * 1e15).toString(),
    ztecid: `ch0000009099000000${channelId}${Math.floor(Math.random() * 9000 + 1000)}`
  };
}

function getSession(channelId) {
  if (!sessions.has(channelId)) {
    sessions.set(channelId, createSession(channelId));
  }
  return sessions.get(channelId);
}

function rotateOrigin(session) {
  session.originIndex = (session.originIndex + 1) % ORIGINS.length;
}

// Cleanup
setInterval(() => sessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH FAILOVER
// =========================
async function fetchSticky(buildUrl, req, session) {
  for (let i = 0; i < ORIGINS.length; i++) {
    const origin = ORIGINS[session.originIndex];
    const url = buildUrl(origin);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

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

    } catch (e) {
      rotateOrigin(session);
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error("All origins failed");
}

// =========================
// HOME
// =========================
app.get("/", (_, res) => {
  res.send("✅ DASH Restream Proxy Running");
});

// =========================
// DASH / SEGMENT PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];
  const session = getSession(channelId);

  const authParams =
    `JITPDRMType=NO` +
    `&virtualDomain=001.live_hls.zte.com` +
    `&m4s_min=1` +
    `&isjitp=0` +
    `&startNumber=${session.startNumber}` +
    `&filedura=6` +
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
    // MPD PATCH
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
    // SEGMENT RESTREAM (m4s_min bypass)
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    });

    const stream = new PassThrough({
      highWaterMark: 1024 * 1024 // 1MB
    });

    stream.pipe(res);

    let lastChunk = Date.now();
    const STALL_LIMIT = 1500;

    const stallWatch = setInterval(() => {
      if (Date.now() - lastChunk > STALL_LIMIT) {
        rotateOrigin(session);
        upstream.body.destroy();
      }
    }, 500);

    upstream.body.on("data", chunk => {
      lastChunk = Date.now();
      stream.write(chunk);
    });

    upstream.body.on("end", () => {
      clearInterval(stallWatch);
      stream.end();
    });

    upstream.body.on("error", () => {
      clearInterval(stallWatch);
      rotateOrigin(session);
      stream.end();
    });

  } catch (e) {
    res.status(502).end();
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`🚀 Proxy running on port ${PORT}`);
});
