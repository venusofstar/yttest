const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.raw({ type: "*/*" }));

// Home
app.get("/", (req, res) => res.send("OK"));

// Helper to generate ZTE-style IDs
function makeId(channelId, offset = 0) {
  const BASE = "ch0000009099000000";
  return BASE + String(Number(channelId) + offset).padStart(4, "0");
}

// Generate IASHttpSessionId dynamically
function generateIASHttpSessionId() {
  return 'RR' + Date.now() + Math.floor(Math.random() * 1000000);
}

// Generate usersessionid dynamically
function generateUserSessionId() {
  return Date.now();
}

// MPD Proxy
app.get("/:channelId/manifest.mpd", async (req, res) => {
  try {
    const { channelId } = req.params;

    const channelFull = makeId(channelId);
    const videoid = makeId(channelId, 100);
    const ztecid = makeId(channelId, 200);
    const usersessionid = generateUserSessionId();
    const IASHttpSessionId = generateIASHttpSessionId();

    // Default startNumber, can override with query param
    const startNumber = req.query.startNumber || 46310365;

    // Upstream MPD URL
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
      `&startNumber=${startNumber}` +
      `&filedura=6` +
      `&IASHttpSessionId=${IASHttpSessionId}`;

    // Fetch upstream MPD
    const response = await fetch(upstreamURL);
    if (!response.ok) throw new Error("Failed to fetch upstream MPD");

    const mpdContent = await response.text();
    res.set("Content-Type", "application/dash+xml");
    res.send(mpdContent);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching MPD");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
