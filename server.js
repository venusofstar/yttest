const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm install node-fetch@2
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

    const response = await fetch(upstreamURL);
    let mpdText = await response.text();

    // Optional: rewrite segment URLs to go through proxy
    mpdText = mpdText.replace(
      /<BaseURL>(.*?)<\/BaseURL>/g,
      `<BaseURL>/${channelId}/</BaseURL>`
    );

    res.setHeader("Content-Type", "application/dash+xml");
    res.send(mpdText);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching MPD");
  }
});

// Proxy all segments (*.m4s)
app.get("/:channelId/:segment", async (req, res) => {
  try {
    const { channelId, segment } = req.params;

    const channelFull = makeId(channelId);
    const videoid = makeId(channelId, 100);
    const ztecid = makeId(channelId, 200);
    const usersessionid = Date.now();

    const upstreamURL =
      `http://143.44.136.67:6060/001/2/${channelFull}/${segment}` +
      `?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY6w65FFCygtQMRRIUPF0xuXe9OnZTxGvJPcGpQT0Y5Pwg%3D%3D` +
      `&JITPDRMType=Widevine` +
      `&virtualDomain=001.live_hls.zte.com` +
      `&videoid=${videoid}` +
      `&ztecid=${ztecid}` +
      `&m4s_min=1` +
      `&usersessionid=${usersessionid}` +
      `&NeedJITP=1` +
      `&isjitp=0`;

    const upstreamRes = await fetch(upstreamURL);

    res.setHeader("Content-Type", "video/iso.segment");
    upstreamRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching segment");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Fully playable DASH proxy running on port ${PORT}`);
});
