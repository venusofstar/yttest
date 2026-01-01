const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const http = require("http");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const agent = new http.Agent({ keepAlive: true });

// 1 CHANNEL = 1 MPD LINK
const CHANNELS = {
  gtv: "http://136.239.158.30:6610/001/2/ch00000090990000001143/manifest.mpd?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY7wAtJC%2BsmBQ5ARU076BdkhW2QukEgPdTHaavrsdcsbbg%3D%3D&version=v1.0&BreakPoint=0&virtualDomain=001.live_hls.zte.com&programid=ch00000000000000001313&contentid=ch00000000000000001313&videoid=ch00000090990000001143&recommendtype=0&userid=1878702116443&boid=001&stbid=02:00:00:00:00:00&terminalflag=1&profilecode=&usersessionid=1025965250&NeedJITP=1&JITPMediaType=DASH&JITPDRMType=NO",

  net25: "http://143.44.136.67:6060/001/2/ch00000090990000001090/manifest.mpd?AuthInfo=ugyrpPX71bbFBJqAe4f1yE0kOteuCHrsbRMPIQGqpT5BCCDeDIJn9rDuWx8BszuX2OhJ3l8Zgn1E37D56Kc9IQ%3D%3D&version=v1.0&BreakPoint=0&virtualDomain=001.live_hls.zte.com&programid=ch00000090990000001090&contentid=ch00000090990000001090&videoid=ch00000090990000001090&recommendtype=0&userid=1878702116443&boid=001&stbid=02:00:00:00:00:00&terminalflag=1&profilecode=&usersessionid=1013243321&NeedJITP=1&JITPMediaType=DASH&JITPDRMType=NO"
};

// MPD + SEGMENTS
app.get("/:channel/*", async (req, res) => {
  const { channel } = req.params;
  const file = req.params[0];

  if (!CHANNELS[channel] || file !== "manifest.mpd") {
    return res.status(404).end();
  }

  const upstream = new URL(CHANNELS[channel]);

  const r = await fetch(upstream.toString(), { agent });
  let mpd = await r.text();

  const base = `${req.protocol}://${req.get("host")}/${channel}/`;

  mpd = mpd.replace(/<BaseURL>.*?<\/BaseURL>/gs, "");
  mpd = mpd.replace(
    /<MPD([^>]*)>/,
    `<MPD$1><BaseURL>${base}</BaseURL>`
  );

  res.set("Content-Type", "application/dash+xml");
  res.send(mpd);
});

app.listen(PORT, () => {
  console.log("✅ MPD → MPD proxy running");
});
