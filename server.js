const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// =========================
// KEEP-ALIVE AGENT
// =========================
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 200,
  keepAliveMsecs: 30000
});

// =========================
// CHANNEL MAP
// =========================
const CHANNELS = {
  gmapinoytv: {
    baseUrl: "https://absp-live.akamaized.net/dash/live/2099522/gmapt3/",
    manifest: "manifest.mpd"
  },

  gmalife: {
    baseUrl: "https://absp-live.akamaized.net/dash/live/2099522/glife3/",
    manifest: "manifest.mpd"
  },

  gmanews: {
    baseUrl: "https://absp-live.akamaized.net/dash/live/2099522/gnews3/",
    manifest: "manifest.mpd"
  },

  kapamilya: {
    baseUrl:
      "https://g003-sle-us-cmaf-prd-ak.cdn.peacocktv.com/co01/pcksle1/Content/CMAF_CTR-4s-v2/Live/channel(2513737-215150-2494669ecae)/",
    manifest: "master.mpd"
  },

  cinemaoneglobal: {
    baseUrl:
      "https://channel.singteltvgo.com/wp/liveorigincluster.poster.iptv.singnet.public/6692/vxfmt=dp/",
    manifest:
      "manifest.mpd?device_profile=DASH_OTT_ENC_CENC_AXINOM"
  }
};

// =========================
// HOME
// =========================
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>HONOR TV PH</title>

<style>
*{
  margin:0;
  padding:0;
  box-sizing:border-box;
}

body{
  height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);
  font-family:Arial,sans-serif;
  color:#fff;
  text-align:center;
}

.box{
  background:rgba(0,0,0,.45);
  padding:30px 40px;
  border-radius:16px;
  box-shadow:0 10px 30px rgba(0,0,0,.5);
  max-width:420px;
  width:90%;
}

h1{
  color:#00e5ff;
  margin-bottom:10px;
}

p{
  margin-top:8px;
}
</style>
</head>

<body>
  <div class="box">
    <h1>📺 HONOR TV PH</h1>
    <p>Enjoy Watching</p>
    <p><small>© 2026</small></p>
  </div>
</body>
</html>
`);
});

// =========================
// DASH PROXY ROUTE
// =========================
app.get("/:channelId/*", async (req, res) => {
  const channelId = req.params.channelId;
  const filePath = req.params[0];

  const channel = CHANNELS[channelId];

  if (!channel) {
    return res.status(404).send("Channel not found");
  }

  const targetUrl = channel.baseUrl + filePath;

  try {
    const upstream = await fetch(targetUrl, {
      agent: httpsAgent,
      headers: {
        "User-Agent":
          req.headers["user-agent"] || "Mozilla/5.0",
        Accept: "*/*",
        Referer: channel.baseUrl,
        Origin: new URL(channel.baseUrl).origin
      }
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .send(`Upstream error: ${upstream.status}`);
    }

    // Forward headers
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // CORS + Cache
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader(
      "Cache-Control",
      "no-cache, no-store, must-revalidate"
    );

    // Stream response
    upstream.body.pipe(res);

  } catch (err) {
    console.error("Proxy Error:", err);

    res.status(500).json({
      error: "Proxy server error",
      message: err.message
    });
  }
});

// =========================
// MANIFEST SHORTCUT ROUTES
// =========================
Object.entries(CHANNELS).forEach(([id, data]) => {
  app.get(`/${id}`, (req, res) => {
    res.redirect(`/${id}/${data.manifest}`);
  });
});

// =========================
// HEALTH CHECK
// =========================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "HONOR TV PH Proxy",
    channels: Object.fromEntries(
      Object.entries(CHANNELS).map(([id, data]) => [
        id,
        `/${id}/${data.manifest}`
      ])
    )
  });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(
    `🚀 HONOR TV PH Proxy running on port ${PORT}`
  );

  console.log("Available Channels:");

  Object.entries(CHANNELS).forEach(([id, data]) => {
    console.log(
      `➡ ${id}: http://localhost:${PORT}/${id}/${data.manifest}`
    );
  });
});
