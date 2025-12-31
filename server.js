const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Case-insensitive routing (.mpd / .MPD)
app.set("case sensitive routing", false);

app.use(cors());

// Home page
app.get("/", (_req, res) => {
  res.send(`
    <html>
      <head><title>AuthInfo Proxy</title></head>
      <body style="font-family: Arial; text-align: center; margin-top: 50px;">
        <h1>WELCOME</h1>
        <p>😀</p>
        <p>ENJOY YOUR LIFE</p>
      </body>
    </html>
  `);
});

// Single ID generator (used everywhere)
function generateChannelId(channelId) {
  const BASE_ID = "ch0000009099000000";
  return BASE_ID + String(Number(channelId)).padStart(4, "0");
}

// MPD proxy
app.get("/:channelId/manifest.mpd", (req, res) => {
  const channelId = generateChannelId(req.params.channelId);

  const usersessionid = Date.now();

  const targetURL =
    `http://143.44.136.67:6060/001/2/${channelId}/manifest.mpd` +
    `?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY6w65FFCygtQMRRIUPF0xuXe9OnZTxGvJPcGpQT0Y5Pwg%3D%3D` +
    `&JITPDRMType=Widevine` +
    `&virtualDomain=001.live_hls.zte.com` +
    `&videoid=${channelId}` +
    `&ztecid=${channelId}` +
    `&usersessionid=${usersessionid}` +
    `&NeedJITP=1` +
    `&isjitp=0` +
    `&startNumber=46310365` +
    `&filedura=6`;

  res.redirect(targetURL);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
