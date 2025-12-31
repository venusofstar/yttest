const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // npm install node-fetch@2
const { PassThrough } = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.raw({ type: "*/*" }));

// =========================
// In-memory cache
// =========================
const segmentCache = new Map();
const CACHE_LIMIT = 500;
const CACHE_TTL = 1000 * 60 * 5;

function setCache(key, data) {
  if (segmentCache.size > CACHE_LIMIT) {
    const firstKey = segmentCache.keys().next().value;
    segmentCache.delete(firstKey);
  }
  segmentCache.set(key, { data, time: Date.now() });
}

function getCache(key) {
  const cached = segmentCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.time > CACHE_TTL) {
    segmentCache.delete(key);
    return null;
  }
  return cached.data;
}

// =========================
// ID generator
// =========================
function makeId(channelId, offset = 0) {
  const BASE = "ch0000009099000000";
  return BASE + String(Number(channelId) + offset).padStart(4, "0");
}

// =========================
// MPD Proxy
// =========================
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
      `&usersessionid=${usersessionid}` +
      `&NeedJITP=1` +
      `&isjitp=0` +
      `&startNumber=46310365` +
      `&filedura=6`;

    const response = await fetch(upstreamURL);
    let mpdText = await response.text();

    // Rewrite BaseURL to proxy
    mpdText = mpdText.replace(
      /<BaseURL>(.*?)<\/BaseURL>/g,
      `<BaseURL>https://yttest-production.up.railway.app/${channelId}/</BaseURL>`
    );

    res.setHeader("Content-Type", "application/dash+xml");
    res.send(mpdText);
  } catch (err) {
    console.error(err);
    res.status(500).send("MPD error");
  }
});

// =========================
// Segment Proxy (.m4s)
// =========================
app.get("/:channelId/*", async (req, res) => {
  try {
    const { channelId } = req.params;
    const segment = req.params[0];
    const cacheKey = `${channelId}_${segment}`;

    const cached = getCache(cacheKey);
    if (cached) {
      res.setHeader("Content-Type", "video/iso.segment");
      return res.send(cached);
    }

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
      `&usersessionid=${usersessionid}` +
      `&NeedJITP=1` +
      `&isjitp=0`;

    const upstreamRes = await fetch(upstreamURL);
    if (!upstreamRes.ok) return res.status(502).send("Upstream error");

    const chunks = [];
    const pass = new PassThrough();

    upstreamRes.body.on("data", (chunk) => {
      chunks.push(chunk);
      pass.write(chunk);
    });

    upstreamRes.body.on("end", () => {
      pass.end();
      setCache(cacheKey, Buffer.concat(chunks));
    });

    res.setHeader("Content-Type", "video/iso.segment");
    pass.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Segment error");
  }
});

app.listen(PORT, () => {
  console.log(`✅ DASH proxy running on port ${PORT}`);
});
