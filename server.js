const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { PassThrough } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.raw({ type: "*/*" }));

// Helper to generate ZTE-style IDs
function makeId(channelId, offset = 0) {
  const BASE = "ch0000009099000000";
  return BASE + String(Number(channelId) + offset).padStart(4, "0");
}

// Dynamic IASHttpSessionId
function generateIASHttpSessionId() {
  return 'RR' + Date.now() + Math.floor(Math.random() * 1000000);
}

// Dynamic usersessionid
function generateUserSessionId() {
  return Date.now();
}

// Function to construct upstream URL with all parameters
function buildUpstreamURL(channelId, startNumber) {
  const channelFull = makeId(channelId);
  const videoid = makeId(channelId, 100);
  const ztecid = makeId(channelId, 200);
  const usersessionid = generateUserSessionId();
  const IASHttpSessionId = generateIASHttpSessionId();

  return `http://143.44.136.67:6060/001/2/${channelFull}/manifest.mpd` +
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
}

// Proxy MPD
app.get("/1089/manifest.mpd", async (req, res) => {
  try {
    const startNumber = req.query.startNumber || Math.floor(Date.now() / 1000);
    const upstreamURL = buildUpstreamURL("1089", startNumber);

    const response = await fetch(upstreamURL);
    if (!response.ok) throw new Error("Failed to fetch MPD");

    const mpdContent = await response.text();
    res.set("Content-Type", "application/dash+xml");
    res.send(mpdContent);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching MPD");
  }
});

// Proxy .m4s segments dynamically
app.get("/1089/:segment", async (req, res) => {
  try {
    const { segment } = req.params;
    const startNumber = req.query.startNumber || Math.floor(Date.now() / 1000);
    const upstreamURL = buildUpstreamURL("1089", startNumber)
      .replace("manifest.mpd", segment); // point to segment

    const upstreamResponse = await fetch(upstreamURL);
    if (!upstreamResponse.ok) throw new Error("Failed to fetch segment");

    res.set("Content-Type", upstreamResponse.headers.get("content-type") || "application/octet-stream");

    // Stream directly to client
    const passThrough = new PassThrough();
    upstreamResponse.body.pipe(passThrough).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching segment");
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
