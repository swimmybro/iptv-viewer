import { config } from './config.js';
import { TtlCache } from './cache.js';
import { UpstreamError, request } from './upstream.js';

const cache = new TtlCache(config.cacheTtl);

/* ------------------------------------------------------------------ */
/* Raw API access                                                      */
/* ------------------------------------------------------------------ */

function apiUrl(params) {
  const u = new URL(`${config.xtream.base}/player_api.php`);
  u.searchParams.set('username', config.xtream.user);
  u.searchParams.set('password', config.xtream.pass);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  return u;
}

async function api(params, { ttl } = {}) {
  const key = JSON.stringify(params);
  return cache.get(
    key,
    async () => {
      const url = apiUrl(params).href;
      const res = await request(url, {
        headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new UpstreamError(
          `Provider responded ${res.status} for ${params.action || 'account'}${hint(res.status, text)}`,
          { url, status: 502 },
        );
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new UpstreamError(
          `Provider returned a non-JSON response for ${params.action || 'account'}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`,
          { url, status: 502 },
        );
      }
    },
    ttl,
  );
}

function hint(status, text) {
  if (status === 401 || status === 403) return ' — check XTREAM_USER / XTREAM_PASS';
  if (/cloudflare|cf-ray|just a moment/i.test(text)) return ' — the provider is behind a Cloudflare challenge';
  return '';
}

/* ------------------------------------------------------------------ */
/* Normalisation helpers                                               */
/* ------------------------------------------------------------------ */

// Trailing decorations providers love: ᴴᴰ, ⁴ᴷ, superscript digits, stray slashes.
const TRAILING_JUNK = /[\p{No}\p{Lm}\p{Mn}⁽⁾\s/|\-–:]+$/gu;
// Leftover separators once a tag or an empty field has been removed: " - NO EVENT", "| LIVE".
const LEADING_JUNK = /^[\s/|\-–:]+/u;
// Leading region/group tag such as "US| ", "CA - ", "UK: ", "[US] ".
const LEADING_TAG = /^\[?([A-Z]{2,3})\]?\s*[:|\-–]\s*/u;

export function cleanName(raw = '') {
  return String(raw).replace(TRAILING_JUNK, '').replace(/\s{2,}/g, ' ').trim();
}

function splitTag(raw = '') {
  const m = LEADING_TAG.exec(raw);
  const rest = m ? raw.slice(m[0].length) : raw;
  return { tag: m ? m[1] : null, title: rest.replace(LEADING_JUNK, '').replace(/\s{2,}/g, ' ').trim() };
}

/**
 * Providers usually title episodes "Show Name S01E02 - Real Title" (or just "S01E02").
 * Reduce that to "Real Title", falling back to "Episode 2".
 */
function episodeTitle(raw, season, number, showName) {
  let t = cleanName(raw || '');
  if (showName) {
    const esc = showName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^${esc}\\s*[-:–]?\\s*`, 'i'), '');
  }
  t = t.replace(/^S\d{1,2}\s*E\d{1,3}\s*[-:–.]?\s*/i, '').replace(/^\d{1,2}x\d{1,3}\s*[-:–.]?\s*/i, '').trim();
  return t || `Episode ${number}`;
}

/** "Heat (1995)" → "Heat" */
function stripYear(title = '') {
  return title.replace(/\s*\((19|20)\d{2}\)\s*$/, '').trim();
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function b64(v) {
  if (!v) return '';
  try {
    return Buffer.from(v, 'base64').toString('utf8');
  } catch {
    return String(v);
  }
}

function normCategory(c) {
  const name = cleanName(c.category_name);
  const { tag, title } = splitTag(name);
  return { id: String(c.category_id), name, title, tag, parentId: num(c.parent_id) || null };
}

function normLive(s) {
  const name = cleanName(s.name);
  const { tag, title } = splitTag(name);
  return {
    kind: 'live',
    id: String(s.stream_id),
    name,
    title,
    tag,
    icon: s.stream_icon || null,
    epgChannelId: s.epg_channel_id || null,
    categoryId: String(s.category_id ?? ''),
    categoryIds: Array.isArray(s.category_ids) ? s.category_ids.map(String) : undefined,
    archive: num(s.tv_archive) === 1,
    archiveDays: num(s.tv_archive_duration),
    num: num(s.num),
    added: num(s.added) || null,
  };
}

function normMovie(s) {
  const name = cleanName(s.name);
  const { tag, title } = splitTag(name);
  return {
    kind: 'movie',
    id: String(s.stream_id),
    name,
    title: stripYear(title),
    tag,
    poster: s.stream_icon || null,
    rating: num(s.rating_5based) || num(s.rating) / 2 || null,
    ext: (s.container_extension || 'mp4').toLowerCase(),
    categoryId: String(s.category_id ?? ''),
    categoryIds: Array.isArray(s.category_ids) ? s.category_ids.map(String) : undefined,
    added: num(s.added) || null,
    year: extractYear(s.name),
  };
}

function normSeries(s) {
  const name = cleanName(s.name);
  const { tag, title } = splitTag(name);
  return {
    kind: 'series',
    id: String(s.series_id),
    name,
    title: stripYear(title),
    tag,
    poster: s.cover || null,
    backdrop: Array.isArray(s.backdrop_path) ? s.backdrop_path[0] || null : s.backdrop_path || null,
    plot: s.plot || '',
    cast: s.cast || '',
    director: s.director || '',
    genre: s.genre || '',
    releaseDate: s.releaseDate || s.release_date || null,
    rating: num(s.rating_5based) || num(s.rating) / 2 || null,
    runtime: s.episode_run_time ? String(s.episode_run_time) : null,
    trailer: s.youtube_trailer || null,
    categoryId: String(s.category_id ?? ''),
    categoryIds: Array.isArray(s.category_ids) ? s.category_ids.map(String) : undefined,
    lastModified: num(s.last_modified) || null,
    year: extractYear(s.name) || yearFrom(s.releaseDate),
  };
}

function extractYear(name = '') {
  const m = /\((19|20)\d{2}\)/.exec(name);
  return m ? Number(m[0].slice(1, -1)) : null;
}

function yearFrom(date) {
  if (!date) return null;
  const y = Number(String(date).slice(0, 4));
  return y > 1800 ? y : null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_ACTION = {
  live: 'get_live_categories',
  movie: 'get_vod_categories',
  series: 'get_series_categories',
};

const STREAM_ACTION = {
  live: 'get_live_streams',
  movie: 'get_vod_streams',
  series: 'get_series',
};

const NORMALISE = { live: normLive, movie: normMovie, series: normSeries };

export function isKind(kind) {
  return kind === 'live' || kind === 'movie' || kind === 'series';
}

export async function account() {
  const data = await api({}, { ttl: 300 });
  const u = data.user_info || {};
  const s = data.server_info || {};
  return {
    username: u.username,
    status: u.status,
    expires: u.exp_date ? Number(u.exp_date) * 1000 : null,
    trial: u.is_trial === '1' || u.is_trial === 1,
    activeConnections: num(u.active_cons),
    maxConnections: num(u.max_connections),
    createdAt: u.created_at ? Number(u.created_at) * 1000 : null,
    timezone: s.timezone || null,
    serverTime: s.time_now || null,
  };
}

export async function categories(kind) {
  const raw = await api({ action: CATEGORY_ACTION[kind] });
  let list = (Array.isArray(raw) ? raw : []).map(normCategory);
  if (kind === 'live' && config.liveCategoryPrefixes.length) {
    list = list.filter((c) => {
      const n = c.name.toUpperCase();
      return config.liveCategoryPrefixes.some((p) => n.startsWith(p));
    });
  }
  return list;
}

export async function streams(kind, categoryId) {
  const params = { action: STREAM_ACTION[kind] };
  if (categoryId) params.category_id = categoryId;
  const raw = await api(params);
  const list = (Array.isArray(raw) ? raw : []).map(NORMALISE[kind]);
  if (kind === 'live' && !categoryId && config.liveCategoryPrefixes.length) {
    // Full live list: keep only channels in visible categories.
    const allowed = new Set((await categories('live')).map((c) => c.id));
    return list.filter((s) => allowed.has(s.categoryId));
  }
  return list;
}

export async function seriesInfo(seriesId) {
  const raw = await api({ action: 'get_series_info', series_id: seriesId }, { ttl: 1800 });
  const info = raw.info || {};
  const seasonsRaw = Array.isArray(raw.seasons) ? raw.seasons : [];
  const episodesRaw = raw.episodes || {};
  const showName = splitTag(cleanName(info.name)).title;

  const seasons = Object.keys(episodesRaw)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((n) => {
      const meta = seasonsRaw.find((s) => num(s.season_number) === n) || {};
      const episodes = (episodesRaw[String(n)] || []).map((e) => ({
        id: String(e.id),
        season: n,
        number: num(e.episode_num),
        title: episodeTitle(e.title, n, num(e.episode_num), showName),
        ext: (e.container_extension || 'mp4').toLowerCase(),
        still: e.info?.movie_image || null,
        plot: e.info?.plot || '',
        aired: e.info?.releasedate || e.info?.air_date || null,
        rating: num(e.info?.rating) || null,
        durationSecs: num(e.info?.duration_secs) || null,
        duration: e.info?.duration || null,
      }));
      episodes.sort((a, b) => a.number - b.number);
      return {
        number: n,
        name: meta.name || (n === 0 ? 'Specials' : `Season ${n}`),
        overview: meta.overview || '',
        cover: meta.cover_big || meta.cover || null,
        airDate: meta.air_date || null,
        episodes,
      };
    });

  return {
    id: String(seriesId),
    kind: 'series',
    name: cleanName(info.name),
    title: stripYear(splitTag(cleanName(info.name)).title),
    poster: info.cover || null,
    backdrop: Array.isArray(info.backdrop_path) ? info.backdrop_path[0] || null : null,
    plot: info.plot || '',
    cast: info.cast || '',
    director: info.director || '',
    genre: info.genre || '',
    releaseDate: info.releaseDate || info.release_date || null,
    rating: num(info.rating_5based) || num(info.rating) / 2 || null,
    runtime: info.episode_run_time ? String(info.episode_run_time) : null,
    trailer: info.youtube_trailer || null,
    categoryId: String(info.category_id ?? ''),
    year: yearFrom(info.releaseDate || info.release_date),
    seasons,
  };
}

export async function movieInfo(streamId) {
  const raw = await api({ action: 'get_vod_info', vod_id: streamId }, { ttl: 1800 });
  const info = raw.info || {};
  const md = raw.movie_data || {};
  const name = cleanName(md.name || info.name);
  return {
    id: String(md.stream_id || streamId),
    kind: 'movie',
    name,
    title: stripYear(splitTag(name).title),
    ext: (md.container_extension || 'mp4').toLowerCase(),
    poster: info.movie_image || info.cover_big || null,
    backdrop: Array.isArray(info.backdrop_path) ? info.backdrop_path[0] || null : null,
    plot: info.plot || info.description || '',
    cast: info.cast || info.actors || '',
    director: info.director || '',
    genre: info.genre || '',
    releaseDate: info.releasedate || info.release_date || null,
    year: yearFrom(info.releasedate || info.release_date) || extractYear(name),
    rating: num(info.rating_5based) || num(info.rating) / 2 || null,
    duration: info.duration || null,
    durationSecs: num(info.duration_secs) || null,
    trailer: info.youtube_trailer || null,
    categoryId: String(md.category_id ?? ''),
    video: info.video || null,
    audio: info.audio || null,
  };
}

export async function shortEpg(streamId, limit = 6) {
  const raw = await api({ action: 'get_short_epg', stream_id: streamId, limit }, { ttl: 120 });
  const list = Array.isArray(raw.epg_listings) ? raw.epg_listings : [];
  return list.map((e) => ({
    id: String(e.id),
    title: b64(e.title),
    description: b64(e.description),
    start: num(e.start_timestamp) * 1000,
    end: num(e.stop_timestamp) * 1000,
    nowPlaying: num(e.now_playing) === 1,
  }));
}

/** Searches titles across every kind. Pulls (and caches) the full lists. */
export async function search(q, limit = 60) {
  const needle = q.trim().toLowerCase();
  if (!needle) return { live: [], movie: [], series: [] };
  const words = needle.split(/\s+/);
  const match = (s) => {
    const hay = s.name.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const [live, movie, series] = await Promise.all([
    streams('live'),
    streams('movie'),
    streams('series'),
  ]);
  return {
    live: live.filter(match).slice(0, limit),
    movie: movie.filter(match).slice(0, limit),
    series: series.filter(match).slice(0, limit),
  };
}

export function clearCache() {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Upstream stream URLs                                                */
/* ------------------------------------------------------------------ */

const { base, user, pass } = config.xtream;

export const upstream = {
  liveHls: (id) => `${base}/live/${user}/${pass}/${id}.m3u8`,
  liveTs: (id) => `${base}/live/${user}/${pass}/${id}.ts`,
  movie: (id, ext) => `${base}/movie/${user}/${pass}/${id}.${ext}`,
  series: (id, ext) => `${base}/series/${user}/${pass}/${id}.${ext}`,
  timeshift: (id, start, durationMin) =>
    `${base}/timeshift/${user}/${pass}/${durationMin}/${start}/${id}.ts`,
};
