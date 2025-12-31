const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Home
app.get("/", (req, res) => {
  res.send("OK");
});

// Helper to generate ZTE-style IDs
function makeId(channelId, offset = 0) {
  const BASE = "ch0000009099000000";
  return BASE + String(Number(channelId) + offset).padStart(4, "0");
}

// Target format:
// https://yttest-production.up.railway.app/1093/manifest.mpd
app.get("/:channelId/manifest.mpd", (req, res) => {
  const { channelId } = req.params;

  const channelFull = makeId(channelId);
  const videoid = makeId(channelId, 100);
  const ztecid = makeId(channelId, 200);
  const usersessionid = Date.now();

  const redirectURL =
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

  res.redirect(redirectURL);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
