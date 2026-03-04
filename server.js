const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const https = require("https");
const { PassThrough } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Keep-alive agent
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 200,
  keepAliveMsecs: 30000
});

// =========================
// CHANNEL MAP
// =========================
const CHANNELS = {
  gmapt3: "https://absp-live.akamaized.net/dash/live/2099522/gmapt3/",
  glife3: "https://absp-live.akamaized.net/dash/live/2099522/glife3/",
  gnews3: "https://absp-live.akamaized.net/dash/live/2099522/gnews3/"
};

// =========================
// HOME
// =========================
app.get("/", (_, res) => {
  res.send("GMA DASH Proxy Running");
});

// =========================
// DASH PROXY
// =========================
app.get("/:channelId/*", async (req, res) => {
  const { channelId } = req.params;
  const path = req.params[0];

  const baseUrl = CHANNELS[channelId];
  if (!baseUrl) {
    return res.status(404).send("Channel not found");
  }

  const targetUrl = baseUrl + path;

  try {
    const upstream = await fetch(targetUrl, {
      agent: httpsAgent,
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Accept": "*/*"
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    // =========================
    // MPD Handling
    // =========================
    if (path.endsWith(".mpd")) {
      let mpd = await upstream.text();
      const proxyBase = `${req.protocol}://${req.get("host")}/${channelId}/`;

      // Remove original BaseURL
      mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "");

      // Inject proxy BaseURL
      mpd = mpd.replace(
        /<MPD([^>]*)>/,
        `<MPD$1><BaseURL>${proxyBase}</BaseURL>`
      );

      res.set({
        "Content-Type": "application/dash+xml",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      });

      return res.send(mpd);
    }

    // =========================
    // SEGMENT Handling
    // =========================
    res.set({
      "Content-Type": "video/mp4",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    });

    const proxyStream = new PassThrough();
    proxyStream.pipe(res);
    upstream.body.pipe(proxyStream);

  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(502).end();
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`✅ GMA DASH proxy running on port ${PORT}`);
});
