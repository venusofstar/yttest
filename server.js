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
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 300, keepAliveMsecs: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 300, keepAliveMsecs: 30000 });

// =========================
// ORIGINS
// =========================
const ORIGINS = [
  "http://136.239.158.30:6610",
  "http://136.158.97.2:6610",
  "http://136.239.173.10:6610",
  "http://136.239.159.20:6610"
];

// Origin health score (higher = more reliable)
const originHealth = ORIGINS.reduce((acc, o) => { acc[o] = 100; return acc; }, {});

// =========================
// CHANNEL SESSIONS
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

// Cleanup
setInterval(() => channelSessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH HEALTH SCORING
// =========================
async function fetchSticky(urlBuilder, req, session) {
  // Sort origins by health descending
  const sortedOrigins = [...ORIGINS].sort((a, b) => originHealth[b] - originHealth[a]);

  for (let i = 0; i < sortedOrigins.length; i++) {
    const origin = sortedOrigins[session.originIndex % sortedOrigins.length];
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

      // Successful fetch → increase health
      originHealth[origin] = Math.min(originHealth[origin] + 5, 100);
      return res;

    } catch (err) {
      console.warn("⚠️ Origin failed:", origin, err.message);
      // Reduce health
      originHealth[origin] = Math.max(originHealth[origin] - 20, 0);
      rotateOrigin(session);
      await new Promise(r => setTimeout(r, 100));
    }
  }
  throw new Error("All origins failed");
}

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
    // SEGMENTS (NEXT SEGMENT PREFETCH + MULTI ORIGIN)
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    });

    const SEGMENT_DURATION = 6000; // default, adaptive can update
    const STALL_LIMIT = 3000;

    const proxyStream = new PassThrough();
    proxyStream.pipe(res);

    let activeSegmentNumber = session.startNumber;
    let activeStream = upstream.body;

    // PREFETCH POOL
    let prefetchStreams = []; // max 2 hot origins
    let lastChunkTime = Date.now();

    const switched = { value: false };

    // ---------- PIPE ACTIVE STREAM ----------
    function pipeStream(stream) {
      stream.on("data", chunk => {
        lastChunkTime = Date.now();
        proxyStream.write(chunk);
      });

      stream.on("end", async () => {
        if (!switched.value && prefetchStreams.length) {
          // Hot swap to next prefetched
          switched.value = true;
          activeStream = prefetchStreams.shift();
          activeSegmentNumber++;
          pipeStream(activeStream);
          prefetchNextSegments(); // keep multi-prefetch
        } else {
          proxyStream.end();
        }
      });

      stream.on("error", err => {
        console.warn("⚠️ Stream error:", err.message);
        if (!switched.value && prefetchStreams.length) {
          switched.value = true;
          activeStream = prefetchStreams.shift();
          activeSegmentNumber++;
          pipeStream(activeStream);
          prefetchNextSegments();
        } else {
          proxyStream.end();
        }
      });
    }

    pipeStream(activeStream);

    // ---------- PREFETCH NEXT SEGMENTS ----------
    async function prefetchNextSegments() {
      while (prefetchStreams.length < 2) {
        const nextSegment = activeSegmentNumber + prefetchStreams.length + 1;

        const nextSession = { ...session };
        rotateOrigin(nextSession);

        try {
          const prefetchRes = await fetchSticky(origin => {
            const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
            const nextPath = path.replace(/startNumber=\d+/, `startNumber=${nextSegment}`);
            return nextPath.includes("?") ? `${base}${nextPath}&${authParams}` : `${base}${nextPath}?${authParams}`;
          }, req, nextSession);

          prefetchStreams.push(prefetchRes.body);
          console.log(`🔥 Prefetched segment ${nextSegment} from ${ORIGINS[nextSession.originIndex]}`);

        } catch (e) {
          console.warn("⚠️ Prefetch failed", e.message);
          break;
        }
      }
    }

    prefetchNextSegments();

    // ---------- WATCHDOG (ADAPTIVE PREFETCH BASED ON LAST CHUNK) ----------
    const watchdog = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastChunkTime;

      // Adaptive prefetch threshold
      const adaptivePrefetchAt = Math.max(1000, SEGMENT_DURATION - elapsed - 1000);
      if (!switched.value && elapsed >= adaptivePrefetchAt) {
        prefetchNextSegments();
      }

      if (elapsed > STALL_LIMIT && !switched.value && prefetchStreams.length) {
        console.warn("⚡ Stall → instant swap");
        switched.value = true;
        activeStream.destroy();
        activeStream = prefetchStreams.shift();
        activeSegmentNumber++;
        pipeStream(activeStream);
        prefetchNextSegments();
      }
    }, 200);

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
