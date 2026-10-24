import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { config, detectFfmpeg } from './config.js';
import { createApiRouter } from './api.js';
import { createStreamRouter } from './streams.js';

const ffmpegAvailable = await detectFfmpeg();

const app = express();
app.disable('x-powered-by');
app.set('etag', false);

app.use((req, res, next) => {
  // Everything is same-origin; this only matters for `ng serve` during development.
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, X-Popcorn-Start');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api', createApiRouter({ ffmpegAvailable }));
app.use('/stream', createStreamRouter({ ffmpegAvailable }));

// Static client
const indexFile = path.join(config.clientDist, 'index.html');
if (fs.existsSync(indexFile)) {
  app.use(
    express.static(config.clientDist, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        // Hashed bundles can be cached forever; everything else must revalidate.
        if (!/\.[0-9A-Z]{8,}\./i.test(path.basename(filePath))) res.set('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get(/^\/(?!api\/|stream\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(503)
      .type('text')
      .send(`Client build not found at ${config.clientDist}\nRun "npm run build" in the client folder first.\n`);
  });
}

app.listen(config.port, config.host, () => {
  const addrs = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${config.port}`);
  console.log(`Popcorn is running`);
  console.log(`  local:    http://localhost:${config.port}`);
  for (const a of addrs) console.log(`  network:  ${a}`);
  console.log(`  provider: ${config.xtream.base}`);
  console.log(`  ffmpeg:   ${ffmpegAvailable ? 'available (remux enabled)' : 'not found (remux disabled)'}`);
  if (config.upstreamDns.length) console.log(`  dns:      ${config.upstreamDns.join(', ')}`);
  if (config.liveCategoryPrefixes.length) {
    console.log(`  live categories limited to prefixes: ${config.liveCategoryPrefixes.join(', ')}`);
  }
});
