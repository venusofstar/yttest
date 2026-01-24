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
// CHANNEL AUTINFO
// =========================
const channelAuth = {
  "1086": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAogpxrMDVv1bZ%2FeMkgHZmwQsyK4TH4mOENKJ45mwOyS0g%3D%3D",
  "1093": "v87HD9rEhwHiAdYyrP20TsXah2%2FZLFNNIdWrVrXDMAoLvT86fM74ocVChyFS93HUsyK4TH4mOENKJ45mwOyS0g%3D%3D"
  // Add more channels here
};

// =========================
// PER-CHANNEL SESSION
// =========================
const channelSessions = new Map();

function createSession(channelId) {
  const ztecid = `ch0000009099000000${channelId}${Math.floor(Math.random() * 9000 + 1000)}`;
  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    startNumber: 46489952 + Math.floor(Math.random() * 100000) * 6,
    IAS: "RR" + Date.now() + Math.random().toString(36).slice(2, 10),
    userSession: Math.floor(Math.random() * 1e15).toString(),
    ztecid
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

// Clear sessions every 10 min
setInterval(() => channelSessions.clear(), 10 * 60 * 1000);

// =========================
// CORS Preflight
// =========================
app.options("*", (req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "*",
  });
  res.sendStatus(200);
});

// =========================
// FETCH WITH STICKY ORIGIN
// =========================
async function fetchSticky(urlBuilder, req, session) {
  for (let attempt = 0; attempt < ORIGINS.length; attempt++) {
    const origin = ORIGINS[session.originIndex];
    const url = urlBuilder(origin);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const headers = {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Accept": "*/*",
        "Connection": "keep-alive",
        "Origin": req.get("origin") || "*",
        "Referer": req.get("referer") || ""
      };

      const resUpstream = await fetch(url, {
        agent: url.startsWith("https") ? httpsAgent : httpAgent,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!resUpstream.ok) throw new Error(`HTTP ${resUpstream.status}`);
      return resUpstream;

    } catch (err) {
      console.error("⚠️ Origin failed:", ORIGINS[session.originIndex], err.message);
      rotateOrigin(session);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  throw new Error("All origins failed");
}

// =========================
// HOME PAGE
// =========================
app.get("/", (_, res) => {
  res.send(`<h1 style="text-align:center;color:white;background:black;padding:50px;">test</h1>`);
});

// =========================
// DASH/HLS PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0]; // manifest.mpd, segment.m4s, or .m3u8
  const session = getSession(channelId);

  const authParams = new URLSearchParams({
    JITPDRMType: "Widevine",
    virtualDomain: "001.live_hls.zte.com",
    m4s_min: "1",
    NeedJITP: "1",
    isjitp: "0",
    startNumber: session.startNumber,
    filedura: "6",
    ispcode: "55",
    IASHttpSessionId: session.IAS,
    usersessionid: session.userSession,
    ztecid: session.ztecid,
    ...(channelAuth[channelId] ? { AutInfo: channelAuth[channelId] } : {})
  }).toString();

  try {
    const upstream = await fetchSticky(origin => {
      const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
      return path.includes("?") ? `${base}${path}&${authParams}` : `${base}${path}?${authParams}`;
    }, req, session);

    const contentType = path.endsWith(".mpd") ? "application/dash+xml" :
                        path.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" :
                        "video/mp4";

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Connection": "keep-alive"
    });

    // =========================
    // MANIFEST REWRITE
    // =========================
    if (path.endsWith(".mpd") || path.endsWith(".m3u8")) {
      let manifest = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/${channelId}/`;
      // Rewrite segment URLs to proxy path
      manifest = manifest.replace(/(https?:\/\/[^\s]+)/g, proxyBase);
      return res.send(manifest);
    }

    // =========================
    // SEGMENTS
    // =========================
    const proxyStream = new PassThrough();
    proxyStream.pipe(res);

    let lastChunk = Date.now();
    const STALL_LIMIT = 3000;

    const stallTimer = setInterval(() => {
      if (Date.now() - lastChunk > STALL_LIMIT) {
        console.warn("⚠️ Segment stall detected, rotating origin...");
        rotateOrigin(session);
        upstream.body.destroy();
      }
    }, 500);

    upstream.body.on("data", chunk => {
      lastChunk = Date.now();
      proxyStream.write(chunk);
    });

    upstream.body.on("end", () => {
      clearInterval(stallTimer);
      proxyStream.end();
    });

    upstream.body.on("error", err => {
      console.warn("⚠️ Stream error, rotating origin...", err.message);
      rotateOrigin(session);
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
