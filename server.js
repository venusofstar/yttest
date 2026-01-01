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
// AGENTS
// =========================
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// =========================
// 1 CHANNEL = 1 MPD LINK
// =========================
const CHANNELS = {
  gtv: "http://136.239.158.30:6610/001/2/ch00000090990000001143/manifest.mpd?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY7wAtJC%2BsmBQ5ARU076BdkhW2QukEgPdTHaavrsdcsbbg%3D%3D&version=v1.0&BreakPoint=0&virtualDomain=001.live_hls.zte.com&programid=ch00000000000000001313&contentid=ch00000000000000001313&videoid=ch00000090990000001143&recommendtype=0&userid=1878702116443&boid=001&stbid=02:00:00:00:00:00&terminalflag=1&profilecode=&usersessionid=1025965250&NeedJITP=1&JITPMediaType=DASH&JITPDRMType=NO",

  net25: "http://143.44.136.67:6060/001/2/ch00000090990000001090/manifest.mpd?AuthInfo=ugyrpPX71bbFBJqAe4f1yE0kOteuCHrsbRMPIQGqpT5BCCDeDIJn9rDuWx8BszuX2OhJ3l8Zgn1E37D56Kc9IQ%3D%3D&version=v1.0&BreakPoint=0&virtualDomain=001.live_hls.zte.com&programid=ch00000090990000001090&contentid=ch00000090990000001090&videoid=ch00000090990000001090&recommendtype=0&userid=1878702116443&boid=001&stbid=02:00:00:00:00:00&terminalflag=1&profilecode=&usersessionid=1013243321&NeedJITP=1&JITPMediaType=DASH&JITPDRMType=NO"
};

// =========================
// HOME
// =========================
app.get("/", (_, res) => {
  res.send("✅ MPD → MPD PLAYABLE PROXY");
});

// =========================
// MPD + SEGMENT PROXY
// =========================
app.get("/:channel/*", async (req, res) => {
  const { channel } = req.params;
  const reqPath = req.params[0];

  if (!CHANNELS[channel]) {
    return res.status(404).end();
  }

  const baseMpd = new URL(CHANNELS[channel]);

  // Build upstream URL
  let upstreamUrl;
  if (reqPath === "manifest.mpd") {
    upstreamUrl = baseMpd.toString();
  } else {
    upstreamUrl = new URL(reqPath, baseMpd).toString();
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

      // Remove upstream BaseURL
      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "");

      // Inject proxy BaseURL
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
    // SEGMENTS (PLAYABLE)
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    });

    const stream = new PassThrough();
    upstream.body.pipe(stream).pipe(res);

  } catch (err) {
    res.status(502).end();
  }
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`✅ Playable DASH proxy running on port ${PORT}`);
});
