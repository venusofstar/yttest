const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm install node-fetch@2

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Home page
app.get("/", (req, res) => {
  res.send("OK");
});

// Helper to generate ZTE-style IDs
function makeId(channelId, offset = 0) {
  const BASE = "ch0000009099000000";
  return BASE + String(Number(channelId) + offset).padStart(4, "0");
}

// Proxy MPD
app.get("/:channelId/manifest.mpd", async (req, res) => {
  try {
    const { channelId } = req.params;

    const channelFull = makeId(channelId);
    const videoid = makeId(channelId, 100);
    const ztecid = makeId(channelId, 200);
    const usersessionid = Date.now();

    const upstreamURL =
      `http://143.44.136.67:6060/001/2/${channelFull}/manifest.mpd` +
      `?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY6w65FFCygtQMRRIUPF0xuXe9OnZTxGvJPcGpQT0Y5Pwg%3D%3D` +
      `&JITPDRMType=Widevine` +
      `&virtualDomain=001.live_hls.zte.com` +
      `&videoid=${videoid}` +
      `&ztecid=${ztecid}` +
      `&m4s_min=1` +
      `&usersessionid=${usersessionid}` +
      `&NeedJITP=1` +
      `&isjitp=0` +
      `&startNumber=46310365` +
      `&filedura=6`;

    // Fetch the MPD from upstream
    const response = await fetch(upstreamURL);
    const mpdText = await response.text();

    // Serve as MPD
    res.setHeader("Content-Type", "application/dash+xml");
    res.send(mpdText);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching MPD");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
