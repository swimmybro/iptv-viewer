import { Router } from 'express';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';
import { request } from './upstream.js';
import { upstream } from './xtream.js';
import { parseFfmpegBanner, peekProbe, storeProbe } from './probe.js';

/*
 * Stream relay.
 *
 *   /stream/live/:id.m3u8        HLS playlist, rewritten so every segment/variant URL
 *                                 points back at this server (signed).
 *   /stream/live/:id.ts          Continuous MPEG-TS, untouched.
 *   /stream/live/fix/:id.ts      Same stream with the audio re-encoded to AAC by ffmpeg (video copied),
 *                                 for feeds carrying AC3 / MP2 / DTS audio that browsers can't decode.
 *   /stream/live/auto/:id.ts     Probes the feed first and converts only what the browser can't play
 *                                 (nothing at all if it's already H.264 + AAC).
 *   /stream/p/:sig/:b64          Signed passthrough used by rewritten playlists.
 *   /stream/vod/:kind/:id.:ext   Movie / episode file with HTTP Range passthrough (seekable).
 *   /stream/remux/:kind/:id.:ext ffmpeg → fragmented MP4 for containers browsers can't play.
 *                                 ?t=<seconds> starts at an offset, ?mode=transcode re-encodes video.
 */

const SECRET = randomBytes(32);
const UPSTREAM_HEADERS = { 'User-Agent': config.userAgent };

function sign(url) {
  return createHmac('sha256', SECRET).update(url).digest('base64url').slice(0, 22);
}

function b64urlEncode(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function b64urlDecode(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function proxyPath(url) {
  return `/stream/p/${sign(url)}/${b64urlEncode(url)}`;
}

/** Rewrites every URI in an HLS playlist to go through this server. */
function rewritePlaylist(text, playlistUrl) {
  const abs = (uri) => {
    try {
      return new URL(uri, playlistUrl).href;
    } catch {
      return uri;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // Tags that carry URIs: EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, EXT-X-I-FRAME-STREAM-INF
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${proxyPath(abs(uri))}"`);
      }
      return proxyPath(abs(trimmed));
    })
    .join('\n');
}

function isPlaylist(url, contentType = '') {
  return /\.m3u8?(\?|$)/i.test(url) || /mpegurl/i.test(contentType);
}

function onClientGone(req, res, fn) {
  let done = false;
  const once = () => {
    if (!done) {
      done = true;
      fn();
    }
  };
  req.on('close', once);
  res.on('close', once);
  res.on('error', once);
}

/** Fetches an upstream URL and relays it (playlists are rewritten, bytes are piped). */
async function relay(req, res, url, { rangeHeader } = {}) {
  const controller = new AbortController();
  onClientGone(req, res, () => controller.abort());

  let up;
  try {
    const headers = { ...UPSTREAM_HEADERS };
    if (rangeHeader) headers.Range = rangeHeader;
    up = await request(url, { headers, signal: controller.signal, timeoutMs: 20_000 });
  } catch (err) {
    if (controller.signal.aborted) return;
    console.warn(`[stream] upstream request failed for ${url}: ${err.message}`);
    if (!res.headersSent) res.status(502).json({ error: err.message || 'Upstream unreachable' });
    return;
  }

  if (!up.ok && up.status !== 206) {
    up.body.resume();
    if (!res.headersSent) res.status(up.status === 404 ? 404 : 502).json({ error: `Upstream responded ${up.status}` });
    return;
  }

  const contentType = String(up.headers['content-type'] || '');

  if (isPlaylist(up.url, contentType)) {
    const text = await up.text();
    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
    });
    res.send(rewritePlaylist(text, up.url));
    return;
  }

  res.status(up.status);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = up.headers[h];
    if (v) res.set(h, String(v));
  }
  if (!up.headers['content-type']) res.set('Content-Type', 'application/octet-stream');
  res.set('Cache-Control', 'no-store');

  try {
    await pipeline(up.body, res);
  } catch (err) {
    if (!controller.signal.aborted && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.warn(`[stream] relay error: ${err.message}`);
    }
    controller.abort();
  }
}

function guessType(ext) {
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'mkv':
      return 'video/x-matroska';
    case 'webm':
      return 'video/webm';
    case 'avi':
      return 'video/x-msvideo';
    case 'ts':
      return 'video/mp2t';
    default:
      return 'application/octet-stream';
  }
}

export function createStreamRouter({ ffmpegAvailable }) {
  const router = Router();

  router.get('/live/:id.m3u8', (req, res) => relay(req, res, upstream.liveHls(req.params.id)));
  router.get('/live/:id.ts', (req, res) => {
    console.log(`[live] raw relay (no conversion) for ${req.params.id}`);
    return relay(req, res, upstream.liveTs(req.params.id));
  });

  /*
   * One upstream connection per viewer: ffmpeg reads the feed, we learn the codecs from
   * its banner, copy the video when it's H.264 and always normalise audio to AAC
   * (AAC→AAC is cheap and avoids a second connection just to find out). If the banner
   * reveals a video codec browsers can't decode, ffmpeg is restarted with x264 before
   * any bytes reach the client.
   */
  router.get('/live/auto/:id.ts', (req, res) => {
    const url = upstream.liveTs(req.params.id);
    if (!ffmpegAvailable) return relay(req, res, url);
    const known = peekProbe(`live:${req.params.id}`);
    const forced = req.query.video === 'transcode';
    const transcodeVideo = forced || (!!known && known.plan.video !== 'copy');
    return liveThroughFfmpeg(req, res, url, {
      transcodeVideo,
      transcodeAudio: true,
      probeKey: `live:${req.params.id}`,
      allowRestart: !forced,
    });
  });

  router.get('/live/fix/:id.ts', (req, res) => {
    if (!ffmpegAvailable) return res.status(501).json({ error: 'ffmpeg is not installed on the server' });
    return liveThroughFfmpeg(req, res, upstream.liveTs(req.params.id), { transcodeAudio: true });
  });

  /** Relays a live TS through ffmpeg, copying whatever the browser can already decode. */
  function liveThroughFfmpeg(req, res, url, { transcodeVideo = false, transcodeAudio = true, probeKey = null, allowRestart = false } = {}) {
    const args = [
      '-hide_banner', '-loglevel', 'info', '-nostdin', '-nostats',
      '-user_agent', config.userAgent,
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
      '-fflags', '+genpts+discardcorrupt+nobuffer', '-analyzeduration', '1500000', '-probesize', '1500000',
      '-i', url,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    ];
    if (transcodeVideo) {
      args.push(
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-vf', "scale='min(1920,iw)':-2", '-profile:v', 'high', '-level', '4.1', '-g', '50',
      );
    } else {
      args.push('-c:v', 'copy');
    }
    if (transcodeAudio) {
      args.push('-c:a', config.remuxAudioCodec, '-ac', '2', '-b:a', '192k', '-af', 'aresample=async=1:first_pts=0');
    } else {
      args.push('-c:a', 'copy');
    }
    args.push('-f', 'mpegts', '-mpegts_flags', '+resend_headers', '-muxdelay', '0.3', '-flush_packets', '1', 'pipe:1');

    console.log(`[live] ffmpeg: video ${transcodeVideo ? 'transcode' : 'copy'}, audio ${transcodeAudio ? 'transcode' : 'copy'} for ${req.originalUrl}`);
    const ff = spawn(config.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let decided = !probeKey;
    let restarted = false;
    const pending = [];

    const decide = () => {
      if (decided) return;
      decided = true;
      const info = parseFfmpegBanner(stderr, { live: true });
      if (info) {
        storeProbe(probeKey, info);
        console.log(
          `[live] ${req.params.id}: ${info.video ? `${info.video.codec} ${info.video.width}x${info.video.height}` : 'no video'} / ` +
            `${info.audio ? `${info.audio.codec} ${info.audio.channels}ch` : 'no audio'}`,
        );
        if (allowRestart && !transcodeVideo && info.plan.video !== 'copy') {
          // Browser can't decode this video: start over with x264 before sending anything.
          restarted = true;
          ff.kill('SIGKILL');
          console.log(`[live] ${req.params.id}: ${info.video?.codec} video → restarting with transcode`);
          liveThroughFfmpeg(req, res, url, { transcodeVideo: true, transcodeAudio, probeKey, allowRestart: false });
          return;
        }
      }
      res.set({ 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store' });
      for (const chunk of pending) res.write(chunk);
      pending.length = 0;
      ff.stdout.pipe(res);
    };

    ff.stderr.on('data', (d) => {
      stderr = (stderr + d.toString()).slice(-6000);
      const line = d.toString();
      if (/^\s*(error|\[.*?\] .*?(error|invalid|forbidden|failed))/im.test(line) && !/deprecated/i.test(line)) {
        console.warn(`[live] ffmpeg (${req.params.id}): ${line.trim().split('\n').pop()}`);
      }
      if (!decided && /Output #0/.test(stderr)) decide();
    });
    ff.stdout.on('data', (chunk) => {
      if (decided) return;
      pending.push(chunk);
      decide();
    });
    if (decided) {
      res.set({ 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store' });
      ff.stdout.pipe(res);
    }
    onClientGone(req, res, () => ff.kill('SIGKILL'));
    ff.on('error', (err) => {
      console.warn(`[live] failed to start ffmpeg: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed to start' });
    });
    ff.on('close', (code, signal) => {
      if (restarted) return;
      if (code && signal !== 'SIGKILL') {
        const tail = stderr.trim().split('\n').filter((l) => !/^\s*(Input|Output|Stream|Metadata|Duration|Program|  )/.test(l)).slice(-2).join(' | ');
        console.warn(`[live] ffmpeg exited ${code} for ${req.params.id}: ${tail || '(no output)'}`);
      }
      if (!res.headersSent) res.status(502).json({ error: 'The provider did not deliver this stream' });
      if (!res.writableEnded) res.end();
    });
  }

  router.get('/p/:sig/:b64', (req, res) => {
    let url;
    try {
      url = b64urlDecode(req.params.b64);
    } catch {
      return res.status(400).end();
    }
    if (sign(url) !== req.params.sig) return res.status(403).end();
    return relay(req, res, url, { rangeHeader: req.headers.range });
  });

  router.get('/vod/:kind(movie|series)/:id.:ext', (req, res) => {
    const { kind, id, ext } = req.params;
    const url = upstream[kind](id, ext);
    return relay(req, res, url, { rangeHeader: req.headers.range });
  });

  router.get('/remux/:kind(movie|series)/:id.:ext', (req, res) => {
    if (!ffmpegAvailable) return res.status(501).json({ error: 'ffmpeg is not installed on the server' });
    const { kind, id, ext } = req.params;
    const url = upstream[kind](id, ext);
    const start = Math.max(0, Number(req.query.t) || 0);
    const transcode = req.query.mode === 'transcode' || req.query.video === 'transcode';
    const copyAudio = req.query.audio === 'copy';

    const args = [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-user_agent', config.userAgent,
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    ];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', url, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn');
    if (transcode) {
      args.push(
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-vf', "scale='min(1920,iw)':-2", '-profile:v', 'high', '-level', '4.1',
      );
    } else {
      args.push('-c:v', 'copy');
      // Chrome only plays HEVC in MP4 when it's tagged hvc1 (MKV usually carries hev1 or none).
      const known = peekProbe(`${kind}:${id}.${ext}`);
      if (known?.video?.codec === 'hevc' || req.query.vcodec === 'hevc') args.push('-tag:v', 'hvc1');
    }
    if (copyAudio) args.push('-c:a', 'copy');
    else args.push('-c:a', config.remuxAudioCodec, '-ac', '2', '-b:a', '192k');
    args.push(
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration', '1000000',
      '-f', 'mp4', 'pipe:1',
    );

    const ff = spawn(config.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d) => (stderr += d.toString().slice(0, 2000)));

    res.set({
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store',
      'X-Popcorn-Start': String(start),
    });

    ff.stdout.pipe(res);
    onClientGone(req, res, () => ff.kill('SIGKILL'));
    ff.on('error', (err) => {
      console.warn(`[remux] failed to start ffmpeg: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed to start' });
    });
    ff.on('close', (code, signal) => {
      if (code && signal !== 'SIGKILL') {
        console.warn(`[remux] ffmpeg exited ${code}: ${stderr.trim().split('\n').pop() || '(no output)'}`);
      }
      if (!res.writableEnded) res.end();
    });
  });

  return router;
}

export { guessType };
