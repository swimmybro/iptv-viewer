import { Router } from 'express';
import * as xt from './xtream.js';
import { clearProbeCache, peekProbe, probe } from './probe.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function kindParam(req, res, next) {
  if (!xt.isKind(req.params.kind)) return res.status(404).json({ error: 'Unknown kind' });
  next();
}

let epgWarned = false;

export function createApiRouter({ ffmpegAvailable }) {
  const router = Router();

  router.get('/capabilities', (_req, res) => {
    res.json({ remux: ffmpegAvailable, version: process.env.npm_package_version || '1.0.0' });
  });

  router.get('/account', wrap(async (_req, res) => res.json(await xt.account())));

  router.get(
    '/categories/:kind',
    kindParam,
    wrap(async (req, res) => res.json(await xt.categories(req.params.kind))),
  );

  router.get(
    '/streams/:kind',
    kindParam,
    wrap(async (req, res) => {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      res.json(await xt.streams(req.params.kind, category));
    }),
  );

  router.get('/series/:id', wrap(async (req, res) => res.json(await xt.seriesInfo(req.params.id))));
  router.get('/movie/:id', wrap(async (req, res) => res.json(await xt.movieInfo(req.params.id))));
  router.get(
    '/live/:id/probe',
    wrap(async (req, res) => {
      if (!ffmpegAvailable) return res.json({ available: false });
      // Filled in by the ffmpeg process that relays the channel; we never open a separate connection.
      const p = peekProbe(`live:${req.params.id}`);
      res.json(p ? { available: true, ...p } : { available: true, pending: true });
    }),
  );

  router.get(
    '/vod/:kind(movie|series)/:id/:ext/probe',
    wrap(async (req, res) => {
      if (!ffmpegAvailable) return res.json({ available: false });
      const { kind, id, ext } = req.params;
      const p = await probe(`${kind}:${id}.${ext}`, xt.upstream[kind](id, ext));
      res.json({ available: true, ...p });
    }),
  );

  // Guide data is optional: some providers refuse the EPG action. Return nothing rather than an error.
  router.get(
    '/epg/:id',
    wrap(async (req, res) => {
      try {
        res.json(await xt.shortEpg(req.params.id, Number(req.query.limit) || 6));
      } catch (err) {
        if (!epgWarned) {
          epgWarned = true;
          console.warn(`[api] EPG unavailable from this provider (${err.message}). Guide data will be blank.`);
        }
        res.json([]);
      }
    }),
  );

  router.get(
    '/search',
    wrap(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (q.trim().length < 2) return res.json({ live: [], movie: [], series: [] });
      res.json(await xt.search(q));
    }),
  );

  router.post('/cache/clear', (_req, res) => {
    xt.clearCache();
    clearProbeCache();
    res.json({ ok: true });
  });

  router.use((err, req, res, _next) => {
    const status = err.status || 500;
    const detail = err.code ? ` (${err.code})` : '';
    console.error(`[api] ${req.method} ${req.originalUrl} → ${status}: ${err.message}${detail}`);
    if (status >= 500 && !err.status) console.error(err);
    res.status(status).json({ error: `${err.message || 'Server error'}${detail}` });
  });

  return router;
}
