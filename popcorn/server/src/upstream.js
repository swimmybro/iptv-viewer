import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { config } from './config.js';

/* Optional custom resolver (UPSTREAM_DNS). Results are cached briefly so a video
   with thousands of segment requests doesn't hammer the resolver. */
let lookup;
if (config.upstreamDns.length) {
  const resolver = new dns.Resolver();
  resolver.setServers(config.upstreamDns);
  const cache = new Map();
  lookup = (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    // IP literals and localhost don't need the custom resolver.
    if (hostname === 'localhost' || net.isIP(hostname)) return dns.lookup(hostname, options, callback);
    const hit = cache.get(hostname);
    if (hit && hit.expires > Date.now()) return process.nextTick(cb, null, hit.address, 4);
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        return cb(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }));
      }
      cache.set(hostname, { address: addresses[0], expires: Date.now() + 300_000 });
      cb(null, addresses[0], 4);
    });
  };
}

/*
 * A small HTTP client for talking to the provider.
 *
 * Why not fetch()? Node's fetch (undici) rejects responses with slightly malformed
 * headers, and many Xtream panels send exactly those. node:http with
 * `insecureHTTPParser` tolerates them. This helper follows redirects, applies a
 * timeout, and returns a node Readable as the body so it can be piped straight
 * to the browser.
 */

const MAX_REDIRECTS = 5;

/**
 * @param {string} url
 * @param {{ headers?: Record<string,string>, signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: number, ok: boolean, url: string, headers: import('node:http').IncomingHttpHeaders, body: import('node:http').IncomingMessage, text: () => Promise<string> }>}
 */
export function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const visited = [];

    const go = (current) => {
      if (visited.length > MAX_REDIRECTS) return reject(new UpstreamError('Too many redirects', { url: current }));
      visited.push(current);

      let target;
      try {
        target = new URL(current);
      } catch {
        return reject(new UpstreamError(`Invalid upstream URL: ${current}`));
      }
      const lib = target.protocol === 'https:' ? https : http;

      const req = lib.request(
        target,
        {
          method: 'GET',
          headers: { Accept: '*/*', Connection: 'keep-alive', ...opts.headers },
          insecureHTTPParser: true,
          timeout: opts.timeoutMs ?? 30_000,
          lookup,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            const next = new URL(res.headers.location, target).href;
            return go(next);
          }
          resolve({
            status,
            ok: status >= 200 && status < 300,
            url: target.href,
            headers: res.headers,
            body: res,
            text: () =>
              new Promise((ok, fail) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
                res.on('error', fail);
              }),
          });
        },
      );

      req.on('timeout', () => req.destroy(new UpstreamError('Provider timed out', { url: current })));
      req.on('error', (err) => reject(err instanceof UpstreamError ? err : wrap(err, current)));

      if (opts.signal) {
        if (opts.signal.aborted) return req.destroy();
        opts.signal.addEventListener('abort', () => req.destroy(), { once: true });
      }
      req.end();
    };

    go(url);
  });
}

export class UpstreamError extends Error {
  constructor(message, { url, code, status = 502 } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.url = url;
    this.code = code;
    this.status = status;
  }
}

function wrap(err, url) {
  const code = err.code || err.cause?.code;
  const host = safeHost(url);
  let message;
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      message = `Can't resolve ${host}. Check XTREAM_HOST${config.upstreamDns.length ? '' : ', or set UPSTREAM_DNS=1.1.1.1 in .env if your ISP blocks it'}.`;
      break;
    case 'ECONNREFUSED':
      message = `${host} refused the connection. Check the port in XTREAM_HOST.`;
      break;
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      message = `Connection to ${host} ${code === 'ETIMEDOUT' ? 'timed out' : 'was reset'}.`;
      break;
    case 'HPE_INVALID_HEADER_TOKEN':
    case 'HPE_INVALID_CONSTANT':
      message = `${host} sent a malformed HTTP response.`;
      break;
    default:
      message = `Request to ${host} failed: ${err.message}`;
  }
  return new UpstreamError(message, { url, code });
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
