import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the project root (../../.env), then server/.env, then the current directory,
// so it works whether you run `npm start` from the root, from server/, or via a service manager.
// Variables already set in the environment always win (dotenv never overrides them).
for (const file of [path.resolve(here, '../../.env'), path.resolve(here, '../.env'), path.resolve('.env')]) {
  dotenv.config({ path: file, quiet: true });
}

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

function list(name) {
  return (process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',

  // Xtream Codes provider. XTREAM_HOST includes scheme and optional port, e.g. http://example.com:8080
  xtream: {
    base: required('XTREAM_HOST').replace(/\/+$/, ''),
    user: required('XTREAM_USER'),
    pass: required('XTREAM_PASS'),
  },

  // Only show live categories whose name starts with one of these prefixes (case-insensitive).
  // Empty list = show everything.
  liveCategoryPrefixes: list('LIVE_CATEGORY_PREFIXES').map((p) => p.toUpperCase()),

  // Seconds to cache catalog responses (categories, stream lists) in memory.
  cacheTtl: Number(process.env.CACHE_TTL || 900),

  // Path to ffmpeg; set to empty string to disable remuxing.
  ffmpeg: process.env.FFMPEG_PATH === undefined ? 'ffmpeg' : process.env.FFMPEG_PATH,
  // Audio codec used when converting (aac plays everywhere; libopus is an alternative).
  remuxAudioCodec: process.env.REMUX_AUDIO_CODEC || 'aac',

  // Folder holding the built Angular app.
  clientDist:
    process.env.CLIENT_DIST || path.resolve(here, '../../client/dist/client/browser'),

  // User-Agent forwarded to the provider. Some providers reject unknown agents.
  userAgent: process.env.UPSTREAM_USER_AGENT || 'VLC/3.0.20 LibVLC/3.0.20',

  // Optional DNS server(s) to resolve the provider with, e.g. "1.1.1.1" or "1.1.1.1,8.8.8.8".
  // Useful when your ISP's resolver blocks the provider's domain. Empty = system DNS.
  upstreamDns: list('UPSTREAM_DNS'),
};

/** Resolves to true when ffmpeg can be executed. */
export function detectFfmpeg() {
  return new Promise((resolve) => {
    if (!config.ffmpeg) return resolve(false);
    execFile(config.ffmpeg, ['-version'], (err) => resolve(!err));
  });
}
