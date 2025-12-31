const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow MPD / mpd / MPD
app.set("case sensitive routing", false);

app.use(cors());

// Home page
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>AuthInfo Proxy</title>
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
        <h1>WELCOME</h1>
        <p>😀</p>
        <p>ENJOY YOUR LIFE</p>
      </body>
    </html>
  `);
});

// Helper
function generateId(base, channelId) {
  return base + String(Number(channelId)).padStart(4, "0");
}

// MPD proxy
app.get("/:channelId/manifest.mpd", (req, res) => {
  const { channelId } = req.params;

  const BASE_ID = "ch0000009099000000";

  // SAME ID for channel, videoid & ztecid
  const fullChannelId = generateId(BASE_ID, channelId);
  const videoid = fullChannelId;
  const ztecid = fullChannelId;

  const usersessionid = Date.now();

  const targetURL =
    `http://143.44.136.67:6060/001/2/${fullChannelId}/manifest.mpd` +
    `?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY6w65FFCygtQMRRIUPF0xuXe9OnZTxGvJPcGpQT0Y5Pwg%3D%3D` +
    `&JITPDRMType=Widevine` +
    `&virtualDomain=001.live_hls.zte.com` +
    `&videoid=${videoid}` +
    `&ztecid=${ztecid}` +
    `&usersessionid=${usersessionid}` +
    `&NeedJITP=1` +
    `&isjitp=0` +
    `&startNumber=46310365` +
    `&filedura=6`;

  res.redirect(targetURL);
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
