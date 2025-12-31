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
// KEEP ALIVE AGENTS
// =========================
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200 });

// =========================
// ORIGINS
// =========================
const ORIGINS = [
  "http://143.44.136.67:6060",
  "http://136.239.158.18:6610"
];

// =========================
// SESSION STORE
// =========================
const sessions = new Map();

function createSession(channelId) {
  return {
    originIndex: Math.floor(Math.random() * ORIGINS.length),
    usersessionid: Date.now().toString() + Math.floor(Math.random() * 1000),
    authInfo:
      "Tajaqa/dPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY6w65FFCygtQMRRIUPF0xuXe9OnZTxGvJPcGpQT0Y5Pwg==",
    firstSegmentTs: null,
    stable: false
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

setInterval(() => sessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH STICKY ORIGIN
// =========================
async function fetchSticky(urlBuilder, req, session) {
  for (let i = 0; i < ORIGINS.length; i++) {
    const origin = ORIGINS[session.originIndex];
    const url = urlBuilder(origin);

    try {
      const res = await fetch(url, {
        agent: url.startsWith("https") ? httpsAgent : httpAgent,
        headers: {
          "User-Agent": req.headers["user-agent"] || "VLC/3.0",
          "Accept": "*/*",
          "Connection": "keep-alive",
          ...(req.headers.range ? { Range: req.headers.range } : {})
        }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch {
      rotateOrigin(session);
    }
  }
  throw new Error("All origins failed");
}

// =========================
// HOME
// =========================
app.get("/", (_, res) => res.send("DASH Proxy Running"));

// =========================
// DASH PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  let path = req.params[0];
  const session = getSession(channelId);

  const params = new URLSearchParams({
    AuthInfo: session.authInfo,
    version: "v1.0",
    BreakPoint: "0",
    virtualDomain: "001.live_hls.zte.com",
    programid: `ch0000000000000000${channelId}`,
    contentid: `ch0000000000000000${channelId}`,
    videoid: `ch0000009099000000${channelId}`,
    userid: "1878702116443",
    usersessionid: session.usersessionid,
    NeedJITP: "1",
    JITPMediaType: "DASH",
    JITPDRMType: "NO",
    m4s_min: "1" // MUST STAY
  });

  try {
    // =========================
    // STABILITY GATE (BYPASS)
    // =========================
    if (path.endsWith(".m4s")) {
      const now = Date.now();

      if (!session.firstSegmentTs) {
        session.firstSegmentTs = now;
      }

      // wait 3 seconds before delivering segments
      if (!session.stable) {
        if (now - session.firstSegmentTs < 3000) {
          return res.status(204).end();
        }
        session.stable = true;
      }
    }

    const upstream = await fetchSticky(origin => {
      const base = `${origin}/001/2/ch0000009099000000${channelId}/`;
      return path.includes("?")
        ? `${base}${path}&${params}`
        : `${base}${path}?${params}`;
    }, req, session);

    // =========================
    // MPD FIX (LIVE LOCK)
    // =========================
    if (path.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const baseURL = `${req.protocol}://${req.get("host")}/${channelId}/`;

      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "");
      mpd = mpd.replace(
        /<MPD([^>]*)>/,
        `<MPD$1 minimumUpdatePeriod="PT2S" timeShiftBufferDepth="PT30S">`
      );

      // force safe start
      mpd = mpd.replace(/startNumber="\d+"/g, 'startNumber="5"');

      mpd = mpd.replace(
        /<MPD([^>]*)>/,
        `<MPD$1>\n<BaseURL>${baseURL}</BaseURL>`
      );

      res.set({
        "Content-Type": "application/dash+xml",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });

      return res.send(mpd);
    }

    // =========================
    // SEGMENT STREAM
    // =========================
    res.status(req.headers.range ? 206 : 200);
    res.set({
      "Content-Type": path.endsWith(".m4s")
        ? "video/iso.segment"
        : "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*"
    });

    if (upstream.headers.get("content-range"))
      res.set("Content-Range", upstream.headers.get("content-range"));

    if (upstream.headers.get("content-length"))
      res.set("Content-Length", upstream.headers.get("content-length"));

    const stream = new PassThrough();
    upstream.body.pipe(stream).pipe(res);

    upstream.body.on("error", () => {
      rotateOrigin(session);
      stream.end();
    });

  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(502).end();
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () =>
  console.log(`✅ DASH proxy running on port ${PORT}`)
);
