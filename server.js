const express = require("express");
const cors = require("cors");
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

setInterval(() => channelSessions.clear(), 10 * 60 * 1000);

// =========================
// FETCH WITH FAILOVER
// =========================
async function fetchSticky(urlBuilder, req, session) {
  for (let i = 0; i < ORIGINS.length; i++) {
    const origin = ORIGINS[session.originIndex];
    const url = urlBuilder(origin);

    try {
      console.log("➡️ FETCH:", url);

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

    } catch (err) {
      console.error("⚠️ Origin failed:", origin, err.message);
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
  res.send(`
    <html>
      <body style="background:black;display:flex;align-items:center;justify-content:center;height:100vh;">
        <h1 style="font-size:4rem;
          background:linear-gradient(270deg,red,orange,yellow,green,blue,indigo,violet);
          background-size:1400% 1400%;
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
          animation:rainbow 10s infinite;">
          Star Of Venus
        </h1>
      </body>
    </html>
  `);
});

// =========================
// DASH PROXY
// =========================
app.get("/converge/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];
  const session = getSession(channelId);

  const authParams =
    `AuthInfo=ugyrpPX71bbFBJqAe4f1yE0kOteuCHrsbRMPIQGqpT5BCCDeDIJn9rDuWx8BszuX2OhJ3l8Zgn1E37D56Kc9IQ%3D%3D` +
    `&JITPDRMType=NO` +
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

    // ===== MPD =====
    if (path.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/converge/${channelId}/`;

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

    // ===== SEGMENTS =====
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    });

    const proxyStream = new PassThrough();
    proxyStream.pipe(res);

    let lastChunk = Date.now();
    const stallTimer = setInterval(() => {
      if (Date.now() - lastChunk > 3000) {
        console.warn("⚠️ Stall detected, rotating origin");
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

    upstream.body.on("error", () => {
      rotateOrigin(session);
      proxyStream.end();
    });

  } catch (err) {
    console.error("❌ PROXY ERROR:", err.message);
    res.status(502).end();
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`✅ Proxy running on port ${PORT}`);
});
