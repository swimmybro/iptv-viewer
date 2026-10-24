# Popcorn

A self-hosted web app for an IPTV service that speaks the Xtream Codes API. Run it on one machine
(an Optiplex in a closet works nicely) and watch from any browser on your network — desktop, phone,
tablet, or installed as an app.

```
┌───────────────┐   http://optiplex:8080   ┌───────────────────────┐   player_api.php / streams   ┌──────────┐
│  any browser  │ ───────────────────────▶ │  Popcorn server (Node) │ ──────────────────────────▶ │ provider │
│  on your LAN  │ ◀─────────────────────── │  · API proxy + cache   │ ◀────────────────────────── │ (Xtream) │
└───────────────┘   app + relayed video    │  · stream relay        │                              └──────────┘
                                           │  · ffmpeg conversion   │
                                           │  · serves the Angular  │
                                           │    app                 │
                                           └───────────────────────┘
```

The browser only ever talks to Popcorn. Your provider credentials live in a `.env` file on the server
and never reach the browser, there are no CORS or mixed-content problems, and files the browser can't
play (MKV with AC3/DTS audio, AVI, …) are converted on the fly with ffmpeg.

## What's in the box

- **Live TV** — categories, channel logos, what's on now and next with a progress bar, channel up/down,
  a channel drawer inside the player, quality picker for multi-bitrate streams.
- **Movies & Series** — poster grids with sort and filter, "recently added", detail pages with plot,
  cast and rating, season tabs, episode lists with watched ticks.
- **Player** — custom controls, keyboard shortcuts, picture-in-picture, fullscreen, playback speed,
  resume where you left off, auto-play next episode with a countdown, automatic fallback to
  server-side conversion when playback fails or the audio track can't be decoded.
- **Favorites, continue watching, recently watched** — stored in the browser, no account needed.
- **Search** across channels, movies and series at once.
- **Installable** — add it to your home screen / desktop and it opens as a standalone app.

## Requirements

- Node.js 20 or newer (24 is fine)
- ffmpeg on the server — optional, but strongly recommended for MKV playback
  - Windows: `winget install Gyan.FFmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Docker image below already includes it

## Quick start

```bash
cp .env.example .env        # then edit it with your provider URL, username and password
npm run setup               # installs client and server dependencies
npm run build               # builds the Angular app into client/dist
npm start                   # http://localhost:8080
```

The server prints the LAN URLs it is reachable on, e.g. `http://192.168.1.50:8080`. Open that from
any device on your network.

### `.env` reference

| Variable                 | What it does                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `XTREAM_HOST`            | Provider base URL including scheme and port, e.g. `http://host.example:8080`                       |
| `XTREAM_USER` / `_PASS`  | Your provider credentials                                                                          |
| `PORT`                   | Port Popcorn listens on (default `8080`)                                                           |
| `LIVE_CATEGORY_PREFIXES` | Comma-separated prefixes to keep, e.g. `US,CA,UK`. Empty shows every live category.                |
| `CACHE_TTL`              | Seconds to cache catalog lists in memory (default `900`)                                           |
| `FFMPEG_PATH`            | `ffmpeg` (on PATH), a full path, or empty to disable conversion                                    |
| `REMUX_AUDIO_CODEC`      | Audio codec for converted streams, default `aac`                                                   |
| `UPSTREAM_DNS`           | DNS server(s) to resolve the provider with, e.g. `1.1.1.1`, if your ISP blocks the domain       |
| `UPSTREAM_USER_AGENT`    | User-Agent sent to the provider (defaults to a VLC string; some providers block unknown agents)    |
| `CLIENT_DIST`            | Where the built client lives (only needed if you move folders around)                              |

## Running it on the Optiplex

Pick whichever fits the machine:

**Docker (Linux or Windows with Docker Desktop)** — ffmpeg included, restarts on reboot:

```bash
docker compose up -d --build
```

**Linux without Docker** — install Node and ffmpeg, build as in *Quick start*, then install the
systemd unit in `deploy/popcorn.service` so it starts on boot.

**Windows without Docker** — build as in *Quick start*, then either drop a shortcut to
`deploy/start-popcorn.bat` into `shell:startup`, or follow `deploy/install-windows-service.md` to run
it as a proper service with NSSM.

Open the port (8080 by default) in the machine's firewall if other devices can't reach it.

### Installing it like an app

Chrome / Edge: open Popcorn, then *⋮ → Cast, save and share → Install page as app* (desktop) or
*Add to Home screen* (Android). iOS Safari: *Share → Add to Home Screen*. It launches without browser
chrome and remembers your favorites and progress like any other app.

## Development

Run the server and the Angular dev server side by side; the dev server proxies `/api` and `/stream`
to the Node server so hot reload works end to end.

```bash
npm run dev:server      # Node with --watch on :8080
npm run dev:client      # ng serve on :4200
```

### Layout

```
client/                 Angular 20, standalone components, signals, no UI library
  src/app/core/         API client, local library (favorites/progress/settings), EPG loader, formatters
  src/app/shared/       Icon, Artwork (image with fallback), PosterCard, ChannelCard
  src/app/pages/        home, live, catalog (movies + series), movie-detail, series-detail,
                        search, favorites, settings, player
server/                 Node 20+ / Express, plain ESM JavaScript, two dependencies
  src/config.js         .env parsing, ffmpeg detection
  src/xtream.js         Xtream API client, response normalisation, in-memory cache, search
  src/streams.js        HLS playlist rewriting + signed segment proxy, VOD range passthrough, ffmpeg remux
  src/api.js            /api routes
  src/index.js          wiring + static hosting with SPA fallback
deploy/                 systemd unit, Windows start script, NSSM notes
```

### Server endpoints

| Route                                  | Purpose                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/capabilities`                | `{ remux: bool }` — whether ffmpeg conversion is available       |
| `GET /api/account`                     | Subscription status and expiry                                   |
| `GET /api/categories/:kind`            | `kind` is `live`, `movie` or `series`                            |
| `GET /api/streams/:kind?category=ID`   | Channels / movies / series in a category (all, if omitted)       |
| `GET /api/movie/:id` `GET /api/series/:id` | Detail pages (series includes seasons and episodes)          |
| `GET /api/epg/:streamId`               | Short EPG, titles decoded                                        |
| `GET /api/search?q=`                   | Searches everything                                              |
| `POST /api/cache/clear`                | Drop the catalog cache                                           |
| `GET /stream/live/:id.m3u8`            | Live HLS, rewritten so segments load through Popcorn             |
| `GET /stream/vod/:kind/:id.:ext`       | Movie or episode file, supports Range requests (seeking)         |
| `GET /stream/remux/:kind/:id.:ext?t=`  | Same file converted to fragmented MP4 by ffmpeg (`&mode=transcode` re-encodes video) |

## Notes and limits

- Favorites, watch progress and settings are per browser (localStorage). Different devices keep
  their own lists.
- Converted (ffmpeg) streams seek by restarting ffmpeg at the new position, so a seek takes a second
  or two. Direct MP4 playback seeks instantly.
- `mode=transcode` re-encodes video with x264 `veryfast`. An Optiplex-class CPU handles one 1080p
  stream fine; it is meant as a last resort, not the default.
- Poster and channel-logo images load directly from the provider/TMDB. If you ever put Popcorn behind
  HTTPS, `http://` images would be blocked as mixed content; an image proxy would be the fix.
- Catch-up / timeshift for channels that support `tv_archive` is not wired up yet; the server already
  knows which channels have it.
