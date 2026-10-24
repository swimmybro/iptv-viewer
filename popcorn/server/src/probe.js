import { execFile } from 'node:child_process';
import path from 'node:path';
import { config } from './config.js';
import { TtlCache } from './cache.js';

/*
 * Looks at what a stream actually contains (ffprobe) and decides what has to
 * happen for a browser to play it. Browsers decode H.264 video and AAC/MP3/Opus
 * audio; IPTV feeds often carry AC3 / E-AC3 / MP2 / DTS audio and sometimes
 * HEVC, MPEG-2 or MPEG-4 part 2 video.
 *
 * plan.video:  copy       – browser can decode it
 *              try        – might work (HEVC needs hardware support); try direct first
 *              transcode  – re-encode on the server
 * plan.audio:  copy | transcode
 */

const cache = new TtlCache(900);

const VIDEO_OK = new Set(['h264', 'vp8', 'vp9', 'av1']);
const VIDEO_MAYBE = new Set(['hevc', 'h265']);
const AUDIO_OK = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);

function ffprobePath() {
  if (process.env.FFPROBE_PATH) return process.env.FFPROBE_PATH;
  const ff = config.ffmpeg || 'ffmpeg';
  const dir = path.dirname(ff);
  const base = path.basename(ff).replace(/ffmpeg/i, 'ffprobe');
  return dir === '.' ? base : path.join(dir, base);
}

export function probe(key, url, { live = false } = {}) {
  return cache.get(`probe:${key}`, () => run(url, live));
}

function run(url, live) {
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-user_agent', config.userAgent,
      '-analyzeduration', live ? '4000000' : '5000000',
      '-probesize', live ? '4000000' : '5000000',
      '-print_format', 'json', '-show_streams', '-show_format',
      url,
    ];
    const started = Date.now();
    execFile(ffprobePath(), args, { timeout: 12_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      let data = {};
      try {
        data = JSON.parse(stdout || '{}');
      } catch {
        /* fall through */
      }
      const streams = data.streams || [];
      const v = streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
      const a = streams.find((s) => s.codec_type === 'audio');
      const video = v
        ? { codec: v.codec_name, width: v.width || 0, height: v.height || 0, profile: v.profile || null, bitDepth: v.bits_per_raw_sample ? Number(v.bits_per_raw_sample) : null, pixFmt: v.pix_fmt || null }
        : null;
      const audio = a ? { codec: a.codec_name, channels: a.channels || 0 } : null;
      const tenBit = !!video && (video.bitDepth === 10 || /10le|10be/.test(video.pixFmt || ''));
      const plan = {
        video: !video
          ? 'none'
          : VIDEO_OK.has(video.codec) && !tenBit
            ? 'copy'
            : VIDEO_MAYBE.has(video.codec) && !live
              ? 'try'
              : 'transcode',
        audio: !audio ? 'none' : AUDIO_OK.has(audio.codec) ? 'copy' : 'transcode',
      };
      const durationSecs = Number(data.format?.duration) || null;
      const result = { video, audio, plan, durationSecs, probeMs: Date.now() - started };
      if (err && !streams.length) result.error = err.killed ? 'ffprobe timed out' : err.message.split('\n')[0];
      console.log(
        `[probe] ${url.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, '/$1/***/***/')}: ` +
          `${video ? `${video.codec}${tenBit ? ' 10-bit' : ''} ${video.width}x${video.height}` : 'no video'} / ` +
          `${audio ? `${audio.codec} ${audio.channels}ch` : 'no audio'} → video ${plan.video}, audio ${plan.audio}` +
          (result.error ? ` (${result.error})` : ''),
      );
      resolve(result);
    });
  });
}

export function peekProbe(key) {
  return cache.peek(`probe:${key}`);
}

export function storeProbe(key, info) {
  cache.set(`probe:${key}`, info);
}

/**
 * Builds the same {video, audio, plan} from the "Input #0 … Stream #0:n" block
 * ffmpeg prints on stderr, so a live stream can be analysed by the same ffmpeg
 * process that relays it — one upstream connection instead of two.
 */
export function parseFfmpegBanner(stderr, { live = false } = {}) {
  const v = /Stream #0:\d+[^\n]*?: Video: (\w+)([^\n]*)/.exec(stderr);
  const a = /Stream #0:\d+[^\n]*?: Audio: (\w+)([^\n]*)/.exec(stderr);
  if (!v && !a) return null;
  let video = null;
  if (v) {
    const dims = /(\d{2,5})x(\d{2,5})/.exec(v[2]);
    const pixFmt = /\b(yuv\w+|gray\w*|nv\d+\w*)\b/.exec(v[2])?.[1] || null;
    video = { codec: v[1], width: dims ? Number(dims[1]) : 0, height: dims ? Number(dims[2]) : 0, profile: null, bitDepth: null, pixFmt };
  }
  let audio = null;
  if (a) {
    const ch = /\b(mono|stereo|5\.1(?:\(side\))?|7\.1|quad|(\d+) channels)\b/.exec(a[2]);
    const channels = !ch ? 0 : ch[2] ? Number(ch[2]) : ch[1] === 'mono' ? 1 : ch[1] === 'stereo' ? 2 : ch[1].startsWith('5.1') ? 6 : ch[1] === '7.1' ? 8 : ch[1] === 'quad' ? 4 : 0;
    audio = { codec: a[1], channels };
  }
  const tenBit = !!video && /10le|10be/.test(video.pixFmt || '');
  const plan = {
    video: !video ? 'none' : VIDEO_OK.has(video.codec) && !tenBit ? 'copy' : VIDEO_MAYBE.has(video.codec) && !live ? 'try' : 'transcode',
    audio: !audio ? 'none' : AUDIO_OK.has(audio.codec) ? 'copy' : 'transcode',
  };
  return { video, audio, plan, durationSecs: null, probeMs: 0 };
}

export function clearProbeCache() {
  cache.clear();
}
