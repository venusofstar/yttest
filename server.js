const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const http = require("http");
const https = require("https");
const { PassThrough } = require("stream");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// =========================
// KEEP-ALIVE AGENTS
// =========================
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// =========================
// CHANNEL → FULL MPD LINK
// =========================
const CHANNELS = {
  net25:
    "http://143.44.136.67:6060/001/2/ch00000090990000001090/manifest.mpd?AuthInfo=ugyrpPX71bbFBJqAe4f1yE0kOteuCHrsbRMPIQGqpT5BCCDeDIJn9rDuWx8BszuX2OhJ3l8Zgn1E37D56Kc9IQ%3D%3D&version=v1.0&BreakPoint=0&virtualDomain=001.live_hls.zte.com&programid=ch00000090990000001090&contentid=ch00000090990000001090&videoid=ch00000090990000001090&recommendtype=0&userid=1878702116443&boid=001&stbid=02:00:00:00:00:00&terminalflag=1&profilecode=&usersessionid=1013243321&NeedJITP=1&JITPMediaType=DASH&JITPDRMType=NO",

  gtv:
    "http://136.239.158.30:6610/001/2/ch00000090990000001143/manifest.mpd?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY7wAtJC%2BsmBQ5ARU076BdkhW2QukEgPdTHaavrsdcsbbg%3D%3D&version=v1.0&BreakPoint=0&virtualDomain=001.live_hls.zte.com&programid=ch00000000000000001313&contentid=ch00000000000000001313&videoid=ch00000090990000001143&recommendtype=0&userid=1878702116443&boid=001&stbid=02:00:00:00:00:00&terminalflag=1&profilecode=&usersessionid=1025965250&NeedJITP=1&JITPMediaType=DASH&JITPDRMType=NO"
};

// =========================
// HOME
// =========================
app.get("/", (_, res) => {
  res.send("✅ 1 Channel = 1 Link DASH Proxy");
});

// =========================
// PROXY ROUTE
// =========================
app.get("/:channel/*?", async (req, res) => {
  const { channel } = req.params;

  if (!CHANNELS[channel]) {
    return res.status(404).send("Unknown channel");
  }

  const baseMpdUrl = new URL(CHANNELS[channel]);

  // If no extra path → MPD
  let upstreamUrl;
  if (!req.params[0]) {
    upstreamUrl = baseMpdUrl.toString();
  } else {
    upstreamUrl = new URL(req.params[0], baseMpdUrl).toString();
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      agent: upstreamUrl.startsWith("https") ? httpsAgent : httpAgent,
      headers: {
        "User-Agent": req.headers["user-agent"] || "OTT",
        "Accept": "*/*",
        "Connection": "keep-alive"
      }
    });

    if (!upstream.ok) {
      return res.status(502).end();
    }

    // =========================
    // MPD
    // =========================
    if (upstreamUrl.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/${channel}/`;

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

    const stream = new PassThrough();
    stream.pipe(res);

    upstream.body.pipe(stream);

  } catch (err) {
    res.status(502).end();
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`✅ Proxy running on port ${PORT}`);
});
