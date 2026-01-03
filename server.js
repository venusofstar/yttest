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
  maxSockets: 300,
  keepAliveMsecs: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 300,
  keepAliveMsecs: 30000
});

// =========================
// ORIGINS
// =========================
const ORIGINS = [
  "http://136.239.158.30:6610",
  "http://136.158.97.2:6610",
  "http://136.239.173.10:6610",
  "http://136.239.159.20:6610"
];

// =========================
// PER-CHANNEL SESSION
// =========================
const channelSessions = new Map();

function createSession(channelId) {
  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    startNumber: 46489952 + Math.floor(Math.random() * 100000) * 6,
    IAS: "RR" + Date.now() + Math.random().toString(36).slice(2, 10),
    userSession: Math.floor(Math.random() * 1e15).toString(),
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

// cleanup
setInterval(() => channelSessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH ROTATION
// =========================
async function fetchSticky(urlBuilder, req, session) {
  for (let i = 0; i < ORIGINS.length; i++) {
    const origin = ORIGINS[session.originIndex];
    const url = urlBuilder(origin);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

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
      console.warn("⚠️ Origin failed:", ORIGINS[session.originIndex]);
      rotateOrigin(session);
      await new Promise(r => setTimeout(r, 150));
    }
  }
  throw new Error("All origins failed");
}

// =========================
// HOME
// =========================
app.get("/", (_, res) => {
  res.send("DASH/HLS Proxy Running");
});

// =========================
// DASH / HLS PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];
  const session = getSession(channelId);

  const authParams =
    `JITPDRMType=Widevine` +
    `&virtualDomain=001.live_hls.zte.com` +
    `&m4s_min=1` +
    `&NeedJITP=1` +
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
    // MPD HANDLING
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
    // SEGMENTS (PREFETCH + HOT SWAP)
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    });

    const SEGMENT_DURATION = 6000;
    const PREFETCH_AT = 4000;
    const STALL_LIMIT = 3000;

    const proxyStream = new PassThrough();
    proxyStream.pipe(res);

    let activeStream = upstream.body;
    let prefetchStream = null;
    let lastChunkTime = Date.now();
    let prefetched = false;
    let switched = false;

    async function startPrefetch() {
      if (prefetched) return;
      prefetched = true;

      const nextSession = { ...session };
      rotateOrigin(nextSession);

      try {
        const prefetchRes = await fetchSticky(origin => {
          const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
          return path.includes("?")
            ? `${base}${path}&${authParams}`
            : `${base}${path}?${authParams}`;
        }, req, nextSession);

        console.log("🔥 Prefetch ready:", ORIGINS[nextSession.originIndex]);
        prefetchStream = prefetchRes.body;

      } catch {
        console.warn("⚠️ Prefetch failed");
      }
    }

    const watchdog = setInterval(() => {
      const now = Date.now();

      if (!prefetched && now - lastChunkTime >= PREFETCH_AT) {
        startPrefetch();
      }

      if (!switched && prefetchStream && now - lastChunkTime > STALL_LIMIT) {
        console.warn("⚡ Stall → instant swap");
        switched = true;
        activeStream.destroy();
        activeStream = prefetchStream;
        pipeActive();
      }
    }, 200);

    function pipeActive() {
      activeStream.on("data", chunk => {
        lastChunkTime = Date.now();
        proxyStream.write(chunk);
      });

      activeStream.on("end", () => {
        clearInterval(watchdog);
        proxyStream.end();
      });

      activeStream.on("error", err => {
        console.warn("⚠️ Stream error:", err.message);
        if (prefetchStream && !switched) {
          switched = true;
          activeStream = prefetchStream;
          pipeActive();
        } else {
          proxyStream.end();
        }
      });
    }

    pipeActive();

  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(502).end();
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`✅ Proxy running on port ${PORT}`);
});
