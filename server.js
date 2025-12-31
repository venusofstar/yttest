const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

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

// Proxy route: /:channelId/manifest.mpd
app.get("/:channelId/manifest.mpd", (req, res) => {
  const { channelId } = req.params;

  // URL without AuthInfo
  const goToURL = `http://143.44.136.67:6060/001/2/ch0000009099000000${channelId}/manifest.mpd?AuthInfo=Tajaqa%2FdPohvabxHbYUVrZLZDsxmxbufdpmz6ykZVY6w65FFCygtQMRRIUPF0xuXe9OnZTxGvJPcGpQT0Y5Pwg%3D%3D&JITPDRMType=Widevine&virtualDomain=001.live_hls.zte.com&videoid=ch00000090990000001286&ztecid=ch00000090990000001143&m4s_min=1&usersessionid=702373225&NeedJITP=1&isjitp=0&startNumber=46310365&filedura=6`;

  res.redirect(goToURL);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
