import { DOCUMENT, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnDestroy,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import Hls, { Level } from 'hls.js';
import mpegts from 'mpegts.js';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { EpgService, NowNext, progressOf } from '../../core/epg.service';
import { ClockPipe, TimeOfDayPipe, clock } from '../../core/format';
import { LibraryService, isResumable } from '../../core/library.service';
import { Episode, Kind, LiveChannel, LiveProbe, SeriesInfo } from '../../core/models';
import { Artwork } from '../../shared/artwork';
import { Icon } from '../../shared/icon';
import { describe } from '../live/live';

type Mode = 'direct' | 'remux' | 'transcode';
const NON_NATIVE = new Set(['mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'vob', 'ts', 'm2ts']);
const SAVE_EVERY_MS = 5000;
const HIDE_AFTER_MS = 2600;
const AUTOPLAY_COUNTDOWN = 6;

interface Meta {
  title: string;
  subtitle: string | null;
  poster: string | null;
  ext: string;
  durationSecs: number | null;
  backLink: unknown[];
  /** For library bookkeeping. */
  libraryTitle: string;
  librarySubtitle?: string;
  parentId?: string;
}

@Component({
  selector: 'app-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Artwork, ClockPipe, TimeOfDayPipe],
  templateUrl: './player.html',
  styleUrl: './player.css',
  host: {
    '[class.hide-cursor]': '!controlsVisible() && playing()',
    '(mousemove)': 'poke()',
    '(touchstart)': 'poke()',
    '(click)': 'poke()',
  },
})
export class PlayerPage implements OnDestroy {
  private api = inject(ApiService);
  private epgService = inject(EpgService);
  private library = inject(LibraryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private destroyRef = inject(DestroyRef);
  private document = inject(DOCUMENT);

  readonly kind = input.required<Kind>();
  readonly id = input.required<string>();

  private videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private get video() {
    return this.videoRef().nativeElement;
  }

  /* ---------- state ---------- */
  readonly meta = signal<Meta | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly notice = signal<string | null>(null);

  readonly playing = signal(false);
  readonly waiting = signal(false);
  readonly currentTime = signal(0);
  readonly mediaDuration = signal(0);
  readonly buffered = signal(0);
  readonly volume = signal(1);
  readonly muted = signal(false);
  readonly rate = signal(1);
  readonly fullscreen = signal(false);
  readonly pip = signal(false);
  readonly controlsVisible = signal(true);
  readonly menuOpen = signal<'none' | 'settings' | 'channels'>('none');

  readonly mode = signal<Mode>('direct');
  /** Seconds the current remuxed stream started at. */
  readonly offset = signal(0);
  readonly caps = toSignal(this.api.capabilities().pipe(catchError(() => of({ remux: false, version: '' }))), {
    initialValue: null,
  });

  // Live
  readonly channels = signal<LiveChannel[]>([]);
  readonly channel = computed(() => this.channels().find((c) => c.id === this.id()) ?? null);
  private epgSource = signal<Signal<NowNext> | null>(null);
  readonly epg = computed(() => this.epgSource()?.() ?? null);
  readonly epgPct = computed(() => Math.round(progressOf(this.epg()?.now ?? null, this.clockNow()) * 100));
  readonly channelFilter = signal('');
  readonly filteredChannels = computed(() => {
    const q = this.channelFilter().trim().toLowerCase();
    const list = this.channels();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  });
  private clockNow = signal(Date.now());

  // Series
  readonly series = signal<SeriesInfo | null>(null);
  readonly episode = computed(() => this.findEpisode(this.id()));
  readonly nextEpisode = computed(() => this.neighbourEpisode(1));
  readonly prevEpisode = computed(() => this.neighbourEpisode(-1));
  readonly countdown = signal<number | null>(null);

  // HLS
  readonly levels = signal<Level[]>([]);
  readonly currentLevel = signal(-1);
  /** Which live transport is actually in use right now. */
  readonly liveFormat = signal<'ts' | 'hls'>('ts');
  /**
   * raw    – provider's TS untouched
   * auto   – server probes the feed and converts only what the browser can't decode
   * forced – server re-encodes both video and audio
   */
  readonly liveStage = signal<'raw' | 'auto' | 'forced'>('auto');
  readonly liveProbe = signal<LiveProbe | null>(null);
  /** Human summary of what the probe found (live or VOD). */
  readonly liveSummary = computed(() => {
    const p = this.liveProbe();
    if (!p?.available || (!p.video && !p.audio)) return null;
    const v = p.video ? `${p.video.codec.toUpperCase()} ${p.video.height ? p.video.height + 'p' : ''}`.trim() : 'no video';
    const a = p.audio ? `${p.audio.codec.toUpperCase()}${p.audio.channels ? ' ' + p.audio.channels + 'ch' : ''}` : 'no audio';
    const conv: string[] = [];
    if (p.plan?.video === 'transcode') conv.push('video');
    if (p.plan?.audio === 'transcode') conv.push('audio');
    return { source: `${v} · ${a}`, converting: conv.length ? conv.join(' + ') + ' converted on server' : 'played as-is' };
  });
  private watchdog: ReturnType<typeof setInterval> | null = null;
  readonly liveFormatSetting = computed(() => this.library.settings().liveFormat);

  /* ---------- derived ---------- */
  readonly isLive = computed(() => this.kind() === 'live');
  readonly isFav = computed(() => this.library.isFavorite(this.kind(), this.id()));

  /** Position on the virtual timeline (remux offset + media time). */
  readonly position = computed(() => this.offset() + this.currentTime());
  readonly duration = computed(() => {
    const m = this.meta();
    if (this.mode() === 'direct') return this.mediaDuration() || m?.durationSecs || 0;
    return m?.durationSecs || Math.max(this.position(), this.offset() + this.mediaDuration());
  });
  readonly seekable = computed(() => !this.isLive() && this.duration() > 0);
  readonly progressPct = computed(() => (this.duration() ? (this.position() / this.duration()) * 100 : 0));
  readonly bufferedPct = computed(() => (this.duration() ? ((this.offset() + this.buffered()) / this.duration()) * 100 : 0));
  readonly canConvert = computed(() => !this.isLive() && !!this.caps()?.remux);

  readonly clockPipe = clock;

  private hls: Hls | null = null;
  private ts: mpegts.Player | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private loadToken = 0;
  private resumeTarget: number | null = null;
  private audioCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private audioChecked = false;

  constructor() {
    // Re-initialise whenever the route target changes (channel up/down, next episode).
    effect(() => {
      const kind = this.kind();
      const id = this.id();
      untracked(() => void this.start(kind, id));
    });

    this.clockTimer = setInterval(() => this.clockNow.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => this.teardown());
  }

  ngOnDestroy() {
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  /* ================= lifecycle ================= */

  private async start(kind: Kind, id: string) {
    const token = ++this.loadToken;
    this.saveNow();
    this.teardownMedia();
    this.error.set(null);
    this.notice.set(null);
    this.loading.set(true);
    this.countdown.set(null);
    this.menuOpen.set('none');
    this.levels.set([]);
    this.liveProbe.set(null);
    this.offset.set(0);
    this.currentTime.set(0);
    this.mediaDuration.set(0);
    this.resumeTarget = null;
    this.audioChecked = false;

    const q = this.route.snapshot.queryParamMap;
    try {
      // Know whether the server can convert before choosing how to play.
      if (this.caps() === null) {
        await firstValueFrom(this.api.capabilities().pipe(catchError(() => of(null))));
      }
      const meta = await this.resolveMeta(kind, id, q.get('category'), q.get('series'), q.get('ext'));
      if (token !== this.loadToken) return;
      this.meta.set(meta);
      this.document.title = `${meta.title} · Popcorn`;
      this.library.touchRecent({
        kind,
        id,
        title: meta.libraryTitle,
        image: meta.poster,
        parentId: meta.parentId,
        subtitle: meta.librarySubtitle,
        ext: meta.ext,
      });

      if (kind === 'live') {
        this.epgSource.set(this.epgService.load(id, 8));
        this.attachLive(id, this.library.settings().liveFormat);
      } else {
        const restart = q.get('restart') === '1';
        const prog = this.library.getProgress(kind, id);
        const from = !restart && this.library.settings().resume && isResumable(prog) ? prog.position : 0;
        if (from > 0) this.flash(`Resumed from ${clock(from)}`);
        const settings = this.library.settings();
        let mode: Mode = 'direct';
        if (this.caps()?.remux && settings.mkvMode !== 'never') {
          // Ask the server what's inside the file; it decides what the browser can take as-is.
          const info = await firstValueFrom(
            this.api.vodProbe(kind as 'movie' | 'series', id, meta.ext).pipe(catchError(() => of(null))),
          );
          if (token !== this.loadToken) return;
          if (info?.available) {
            this.liveProbe.set(info);
            const mp4 = /^(mp4|m4v|mov)$/i.test(meta.ext);
            if (info.plan?.video === 'transcode') mode = 'transcode';
            else if (info.plan?.video === 'try' && !mp4) mode = 'remux'; // HEVC in MKV: repackage as MP4
            else if (info.plan?.audio === 'transcode') mode = 'remux';
            else if (settings.mkvMode === 'always' && NON_NATIVE.has(meta.ext.toLowerCase())) mode = 'remux';
            if (!meta.durationSecs && info.durationSecs) this.meta.set({ ...meta, durationSecs: info.durationSecs });
          } else if (settings.mkvMode === 'always' && NON_NATIVE.has(meta.ext.toLowerCase())) {
            mode = 'remux';
          }
        }
        console.info(`[player] ${kind} ${id}.${meta.ext}: starting ${mode}`);
        if (mode !== 'direct') this.flash(mode === 'transcode' ? 'Re-encoding video on the server…' : 'Preparing the file for your browser…');
        this.loadVod(mode, from);
      }
    } catch (err) {
      if (token !== this.loadToken) return;
      this.error.set(describe(err));
      this.loading.set(false);
    }
  }

  private async resolveMeta(kind: Kind, id: string, category: string | null, seriesId: string | null, ext: string | null): Promise<Meta> {
    if (kind === 'live') {
      let list: LiveChannel[] = [];
      if (category) {
        list = await firstValueFrom(this.api.streams('live', category).pipe(catchError(() => of([] as LiveChannel[]))));
      }
      let ch = list.find((c) => c.id === id) ?? null;
      if (!ch) {
        // Fall back to the full list (cached server-side) so a bookmarked URL still works.
        const all = await firstValueFrom(this.api.streams('live').pipe(catchError(() => of([] as LiveChannel[]))));
        ch = all.find((c) => c.id === id) ?? null;
        if (ch && !list.length) list = all.filter((c) => c.categoryId === ch!.categoryId);
      }
      this.channels.set(list);
      return {
        title: ch?.title ?? `Channel ${id}`,
        subtitle: null,
        poster: ch?.icon ?? null,
        ext: 'm3u8',
        durationSecs: null,
        backLink: ['/live', category ?? ch?.categoryId ?? ''],
        libraryTitle: ch?.title ?? `Channel ${id}`,
        parentId: category ?? ch?.categoryId,
      };
    }

    if (kind === 'movie') {
      const info = await firstValueFrom(this.api.movieInfo(id));
      return {
        title: info.title || info.name,
        subtitle: info.year ? String(info.year) : null,
        poster: info.poster,
        ext: info.ext || ext || 'mp4',
        durationSecs: info.durationSecs,
        backLink: ['/movie', id],
        libraryTitle: info.title || info.name,
      };
    }

    // series episode
    if (!seriesId) throw new Error('This episode link is missing its series. Open the show and pick the episode again.');
    const show = await firstValueFrom(this.api.seriesInfo(seriesId));
    this.series.set(show);
    const ep = show.seasons.flatMap((s) => s.episodes).find((e) => e.id === id);
    if (!ep) throw new Error('That episode is no longer listed by the provider.');
    const code = `S${String(ep.season).padStart(2, '0')} · E${String(ep.number).padStart(2, '0')}`;
    return {
      title: show.title,
      subtitle: `${code} — ${ep.title}`,
      poster: ep.still || show.poster,
      ext: ep.ext || ext || 'mp4',
      durationSecs: ep.durationSecs,
      backLink: ['/show', seriesId],
      libraryTitle: show.title,
      librarySubtitle: code,
      parentId: seriesId,
    };
  }

  private teardownMedia() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.ts) {
      try {
        this.ts.pause();
        this.ts.unload();
        this.ts.detachMediaElement();
        this.ts.destroy();
      } catch {
        /* already torn down */
      }
      this.ts = null;
    }
    const v = this.videoRef()?.nativeElement;
    if (v) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private teardown() {
    this.saveNow();
    this.teardownMedia();
    if (this.audioCheckTimer) clearTimeout(this.audioCheckTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.saveTimer) clearInterval(this.saveTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.document.fullscreenElement) this.document.exitFullscreen().catch(() => {});
  }

  /* ================= sources ================= */

  private attachLive(id: string, format: 'ts' | 'hls', stage?: 'raw' | 'auto' | 'forced') {
    const canTs = mpegts.isSupported() && mpegts.getFeatureList().mseLivePlayback;
    const remux = !!this.caps()?.remux;
    this.audioChecked = false;
    this.armProgressWatchdog();
    if (format === 'ts' && canTs) {
      const s = stage ?? (remux ? 'auto' : 'raw');
      this.liveFormat.set('ts');
      this.liveStage.set(s);
      if (remux && !this.liveProbe()) {
        // The relay learns the codecs as it starts; ask a few seconds in (and once more if still pending).
        const ask = (retry: boolean) =>
          this.api.liveProbe(id).subscribe({
            next: (p) => {
              if (this.id() !== id) return;
              if (p.available && !p.pending) this.liveProbe.set(p);
              else if (retry) setTimeout(() => ask(false), 8000);
            },
            error: () => {},
          });
        setTimeout(() => ask(true), 5000);
      }
      const url =
        s === 'raw' ? this.api.liveTsUrl(id) : s === 'auto' ? this.api.liveTsAutoUrl(id) : this.api.liveTsAutoUrl(id, true);
      console.info(`[player] live ${id}: TS (${s}); server conversion ${remux ? 'available' : 'unavailable'}`);
      this.attachTs(url);
    } else {
      this.liveFormat.set('hls');
      const why = !canTs ? 'browser cannot play MPEG-TS' : stage === undefined && this.library.settings().liveFormat === 'hls' ? 'chosen in settings' : 'fallback';
      console.info(`[player] live ${id}: HLS (${why})`);
      this.attachHls(this.api.liveUrl(id));
    }
  }

  /**
   * The current TS attempt didn't work out (undecodable codec, stalls, silence).
   * raw → auto (server converts what's needed) → forced (server re-encodes all) → HLS.
   */
  private escalateLive(reason: string) {
    if (!this.isLive() || this.liveFormat() !== 'ts') return;
    console.warn(`[player] live TS (${this.liveStage()}) failed: ${reason}`);
    this.teardownMedia();
    this.loading.set(true);
    const remux = !!this.caps()?.remux;
    const stage = this.liveStage();
    if (remux && stage === 'raw') {
      this.flash('Converting what your browser can\'t play…');
      this.attachLive(this.id(), 'ts', 'auto');
    } else if (remux && stage === 'auto') {
      this.flash('Re-encoding the stream on the server…');
      this.attachLive(this.id(), 'ts', 'forced');
    } else {
      this.flash('Switching to HLS for this channel…');
      this.attachLive(this.id(), 'hls');
    }
  }

  /** Switch live transport for this session and remember it. */
  setLiveFormat(format: 'ts' | 'hls') {
    this.library.updateSettings({ liveFormat: format });
    this.menuOpen.set('none');
    if (!this.isLive() || this.liveFormat() === format) return;
    this.loading.set(true);
    this.error.set(null);
    this.teardownMedia();
    this.levels.set([]);
    this.attachLive(this.id(), format);
  }

  /** Raw MPEG-TS over HTTP, demuxed in the browser by mpegts.js — the same feed set-top apps use. */
  private attachTs(path: string) {
    const v = this.video;
    // mpegts.js fetches from inside a Web Worker, which has no page base URL: it needs an absolute one.
    const url = new URL(path, window.location.href).href;
    const player = mpegts.createPlayer(
      { type: 'mpegts', isLive: true, url },
      {
        enableWorker: true,
        enableStashBuffer: true,
        stashInitialSize: 1024 * 1024,
        liveBufferLatencyChasing: false,
        liveSync: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 60,
        autoCleanupMinBackwardDuration: 30,
        lazyLoad: false,
        fixAudioTimestampGap: true,
      },
    );
    this.ts = player;
    player.on(mpegts.Events.ERROR, (type: string, detail: string, info: { msg?: string }) => {
      if (this.ts !== player) return;
      this.escalateLive(`${type}/${detail} ${info?.msg ?? ''}`);
    });
    player.attachMediaElement(v);
    player.load();
    this.tryPlay();
  }

  private attachHls(url: string) {
    const v = this.video;
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveDurationInfinity: true,
        backBufferLength: 60,
        maxBufferLength: 30,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        fragLoadingMaxRetry: 6,
        // Start at the best quality rather than ramping up from the bottom; drop only if it stalls.
        startLevel: -1,
        abrEwmaDefaultEstimate: 20_000_000,
        capLevelToPlayerSize: false,
      });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        this.levels.set(data.levels);
        this.currentLevel.set(hls.currentLevel);
        this.tryPlay();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => this.currentLevel.set(data.level));
      let netRetries = 0;
      let mediaRetries = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        console.warn('[player] hls fatal', data.type, data.details);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (netRetries++ < 5) {
              this.flash('Connection hiccup, retrying…');
              setTimeout(() => hls.startLoad(), 1000 * netRetries);
            } else {
              this.fail('The channel is not responding. It may be offline at the provider.');
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (mediaRetries++ < 3) hls.recoverMediaError();
            else {
              this.fail(`Your browser can't decode this HLS stream (${data.details}).`);
              hls.destroy();
              if (this.hls === hls) this.hls = null;
            }
            break;
          default:
            this.fail('Playback failed for this channel.');
        }
      });
      hls.loadSource(url);
      hls.attachMedia(v);
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url;
      this.tryPlay();
    } else {
      this.fail('This browser cannot play live streams.');
    }
  }

  private loadVod(mode: Mode, from: number) {
    this.audioChecked = false;
    const m = this.meta();
    if (!m) return;
    const kind = this.kind() as 'movie' | 'series';
    this.mode.set(mode);
    const v = this.video;
    if (mode === 'direct') {
      this.offset.set(0);
      this.resumeTarget = from > 0 ? from : null;
      v.src = this.api.vodUrl(kind, this.id(), m.ext);
    } else {
      this.offset.set(from);
      this.resumeTarget = null;
      v.src = this.api.remuxUrl(kind, this.id(), m.ext, from, mode === 'transcode', this.liveProbe()?.video?.codec);
    }
    v.load();
    this.tryPlay();
  }

  private tryPlay() {
    const v = this.video;
    const p = v.play();
    if (p) {
      p.catch(() => {
        // Autoplay blocked: show the big play button and wait for a tap.
        this.playing.set(false);
        this.loading.set(false);
      });
    }
  }

  /** Switch to server-side conversion, preserving the current position. */
  convert(mode: 'remux' | 'transcode') {
    if (!this.canConvert()) return;
    const at = Math.floor(this.position());
    this.flash(mode === 'transcode' ? 'Re-encoding on the server…' : 'Converting on the server…');
    this.loading.set(true);
    this.menuOpen.set('none');
    this.loadVod(mode, at);
  }

  playDirect() {
    const at = Math.floor(this.position());
    this.loading.set(true);
    this.menuOpen.set('none');
    this.loadVod('direct', at);
  }

  private fail(message: string) {
    this.error.set(message);
    this.loading.set(false);
    this.playing.set(false);
  }

  /* ================= <video> events ================= */

  onLoadedMetadata() {
    const v = this.video;
    this.mediaDuration.set(Number.isFinite(v.duration) ? v.duration : 0);
    if (this.resumeTarget && this.resumeTarget > 0 && this.resumeTarget < (v.duration || Infinity)) {
      v.currentTime = this.resumeTarget;
    }
    this.resumeTarget = null;
    this.rate.set(v.playbackRate);
  }

  onTimeUpdate() {
    const v = this.video;
    this.currentTime.set(v.currentTime);
    if (v.buffered.length) {
      let end = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= end) end = v.buffered.end(i);
      }
      this.buffered.set(end);
    }
  }

  onPlay() {
    this.playing.set(true);
    this.loading.set(false);
    this.error.set(null);
    this.scheduleHide();
    if (!this.saveTimer) this.saveTimer = setInterval(() => this.saveNow(), SAVE_EVERY_MS);
    this.scheduleAudioCheck();
  }

  /**
   * Chrome plays an MKV whose audio track it can't decode (AC3, E-AC3, DTS…) as a
   * silent video instead of raising an error. After a few seconds of playback,
   * if video bytes are being decoded but audio bytes are not, switch to conversion.
   */
  private scheduleAudioCheck() {
    if (this.audioChecked || !this.canConvert()) return;
    if (this.isLive()) {
      // Only the untouched feed is worth checking; converted stages are already AAC/H.264.
      if (this.liveFormat() !== 'ts' || this.liveStage() !== 'raw') return;
    } else {
      if (this.mode() === 'transcode' || this.library.settings().mkvMode === 'never') return;
    }
    if (this.audioCheckTimer) clearTimeout(this.audioCheckTimer);
    const startedAt = this.video.currentTime;
    let attempts = 0;
    const check = () => {
      const v = this.video as HTMLVideoElement & {
        webkitAudioDecodedByteCount?: number;
        webkitVideoDecodedByteCount?: number;
        mozHasAudio?: boolean;
      };
      // Need ~3 s of actual playback to judge; keep polling (up to ~40 s) until we have it.
      if (v.paused || v.currentTime - startedAt < 3) {
        if (++attempts < 20) this.audioCheckTimer = setTimeout(check, 2000);
        return;
      }
      this.audioChecked = true;
      const frames = v.getVideoPlaybackQuality?.().totalVideoFrames ?? null;
      const expectsVideo = this.liveProbe()?.video !== null;
      const videoDead =
        expectsVideo &&
        (frames === 0 || v.videoWidth === 0 || (typeof v.webkitVideoDecodedByteCount === 'number' && v.webkitVideoDecodedByteCount === 0));
      console.info(`[player] decode check (${this.mode()}): frames=${frames} size=${v.videoWidth}x${v.videoHeight} audioBytes=${v.webkitAudioDecodedByteCount ?? '?'}`);
      const silent =
        (typeof v.webkitAudioDecodedByteCount === 'number' && v.webkitAudioDecodedByteCount === 0 && !videoDead) ||
        v.mozHasAudio === false;
      if (videoDead) {
        // Audio plays but no frames are being decoded: the browser can't handle this video.
        if (this.isLive()) this.escalateLive('no video frames decoded');
        else if (this.mode() === 'direct' && this.liveProbe()?.video?.codec === 'hevc') {
          this.flash('Repackaging the video for your browser…');
          this.loadVod('remux', Math.floor(this.position()));
        } else {
          this.flash('Your browser can\'t decode this video. Re-encoding on the server…');
          this.loadVod('transcode', Math.floor(this.position()));
        }
      } else if (silent) {
        if (this.isLive()) this.escalateLive('no audio decoded');
        else if (this.mode() === 'direct') {
          this.flash('No playable audio track. Converting on the server…');
          this.loadVod('remux', Math.floor(this.position()));
        }
      }
    };
    this.audioCheckTimer = setTimeout(check, 3000);
  }

  /** Playback that never advances for 25 s while "playing" is treated as broken. */
  private armProgressWatchdog() {
    if (this.watchdog) clearInterval(this.watchdog);
    let lastTime = -1;
    let stuckSince = 0;
    this.watchdog = setInterval(() => {
      const v = this.videoRef()?.nativeElement;
      if (!v || v.paused || v.ended || this.error()) {
        stuckSince = 0;
        return;
      }
      if (v.currentTime !== lastTime) {
        lastTime = v.currentTime;
        stuckSince = 0;
        return;
      }
      stuckSince ||= Date.now();
      if (Date.now() - stuckSince > 25_000) {
        stuckSince = 0;
        if (this.isLive() && this.liveFormat() === 'ts') this.escalateLive('no progress for 25 s');
        else if (this.isLive()) this.fail('The stream stopped. The channel may be down at the provider.');
      }
    }, 5000);
  }

  onPause() {
    this.playing.set(false);
    this.showControls();
    this.saveNow();
  }

  onWaiting() {
    this.waiting.set(true);
  }

  onPlaying() {
    this.waiting.set(false);
    this.loading.set(false);
  }

  onVolume() {
    this.volume.set(this.video.volume);
    this.muted.set(this.video.muted);
  }

  onEnded() {
    this.playing.set(false);
    if (this.isLive()) return;
    // A remuxed stream has no known end; treat the media ending as finished only
    // if we're near the expected duration, otherwise it was likely cut short.
    const d = this.duration();
    const finished = !d || this.position() >= d - 20;
    if (finished) this.library.markFinished(this.kind(), this.id());
    else this.saveNow();
    this.showControls();
    if (finished && this.kind() === 'series' && this.nextEpisode() && this.library.settings().autoplayNext) {
      this.beginCountdown();
    }
  }

  onError() {
    const v = this.video;
    const code = v.error?.code;
    if (!v.currentSrc && !v.src) return;
    if (this.isLive()) return; // hls.js reports its own errors
    const settings = this.library.settings();
    if (this.mode() === 'direct' && this.canConvert() && settings.mkvMode !== 'never') {
      this.flash('Your browser could not play this file. Converting on the server…');
      this.loadVod('remux', Math.floor(this.position()));
      return;
    }
    if (this.mode() === 'remux' && this.canConvert()) {
      this.flash('Conversion failed, trying a full re-encode…');
      this.loadVod('transcode', Math.floor(this.position()));
      return;
    }
    const why =
      code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? 'This file format is not supported by your browser.'
        : code === MediaError.MEDIA_ERR_NETWORK
          ? 'The stream was interrupted.'
          : code === MediaError.MEDIA_ERR_DECODE
            ? 'The video could not be decoded.'
            : 'Playback failed.';
    this.fail(why + (this.canConvert() ? '' : ' Install ffmpeg on the server to enable conversion.'));
  }

  /* ================= controls ================= */

  togglePlay() {
    const v = this.video;
    if (v.paused || v.ended) {
      if (v.ended && this.mode() !== 'direct') {
        this.loadVod(this.mode(), 0);
        return;
      }
      void v.play().catch(() => {});
    } else v.pause();
  }

  seekTo(seconds: number) {
    if (!this.seekable()) return;
    const d = this.duration();
    const t = Math.max(0, Math.min(d ? d - 1 : seconds, seconds));
    if (this.mode() === 'direct') {
      this.video.currentTime = t;
      this.currentTime.set(t);
    } else {
      this.loading.set(true);
      this.loadVod(this.mode(), Math.floor(t));
    }
    this.poke();
  }

  seekBy(delta: number) {
    this.seekTo(this.position() + delta);
  }

  onScrub(ev: Event) {
    const pct = Number((ev.target as HTMLInputElement).value);
    this.seekTo((pct / 1000) * this.duration());
  }

  setVolume(ev: Event) {
    const v = Number((ev.target as HTMLInputElement).value);
    this.video.volume = v;
    this.video.muted = v === 0;
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
  }

  setRate(r: number) {
    this.video.playbackRate = r;
    this.rate.set(r);
    this.menuOpen.set('none');
  }

  setLevel(level: number) {
    if (this.hls) this.hls.currentLevel = level;
    this.currentLevel.set(level);
    this.menuOpen.set('none');
  }

  async toggleFullscreen() {
    const host = this.document.querySelector('app-player') as HTMLElement | null;
    try {
      if (this.document.fullscreenElement) await this.document.exitFullscreen();
      else if (host?.requestFullscreen) await host.requestFullscreen();
      else if ((this.video as unknown as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
        (this.video as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      }
    } catch {
      /* ignore */
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    this.fullscreen.set(!!this.document.fullscreenElement);
  }

  async togglePip() {
    const v = this.video as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };
    try {
      if (this.document.pictureInPictureElement) await this.document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {
      /* unsupported */
    }
  }

  onPipChange(active: boolean) {
    this.pip.set(active);
  }

  toggleFav() {
    const m = this.meta();
    if (!m) return;
    this.library.toggleFavorite({
      kind: this.kind(),
      id: this.kind() === 'series' ? (this.series()?.id ?? this.id()) : this.id(),
      title: this.kind() === 'series' ? (this.series()?.title ?? m.title) : m.libraryTitle,
      image: this.kind() === 'series' ? (this.series()?.poster ?? m.poster) : m.poster,
      parentId: m.parentId,
      ext: m.ext,
    });
  }

  readonly isShowFav = computed(() =>
    this.kind() === 'series' ? this.library.isFavorite('series', this.series()?.id ?? '') : this.isFav(),
  );

  toggleMenu(which: 'settings' | 'channels') {
    this.menuOpen.update((m) => (m === which ? 'none' : which));
    this.showControls();
  }

  /** True when the player was reached by navigating inside the app (so "back" has somewhere to go). */
  private readonly cameFromApp = (this.router.lastSuccessfulNavigation?.id ?? 1) > 1;

  back() {
    const m = this.meta();
    if (this.document.fullscreenElement) this.document.exitFullscreen().catch(() => {});
    if (this.cameFromApp) this.location.back();
    else this.router.navigate(m?.backLink ?? ['/']);
  }

  /* ================= live: channel switching ================= */

  stepChannel(delta: number) {
    const list = this.channels();
    if (!list.length) return;
    const i = list.findIndex((c) => c.id === this.id());
    const next = list[(i + delta + list.length) % list.length];
    if (next) this.goChannel(next);
  }

  goChannel(c: LiveChannel) {
    this.menuOpen.set('none');
    this.router.navigate(['/watch/live', c.id], { queryParams: { category: c.categoryId }, replaceUrl: true });
  }

  /* ================= series: episode navigation ================= */

  private findEpisode(id: string): Episode | null {
    return this.series()?.seasons.flatMap((s) => s.episodes).find((e) => e.id === id) ?? null;
  }

  private neighbourEpisode(delta: 1 | -1): Episode | null {
    const all = this.series()?.seasons.flatMap((s) => s.episodes) ?? [];
    const i = all.findIndex((e) => e.id === this.id());
    return i >= 0 ? (all[i + delta] ?? null) : null;
  }

  goEpisode(ep: Episode | null) {
    if (!ep) return;
    this.cancelCountdown();
    this.router.navigate(['/watch/series', ep.id], {
      queryParams: { series: this.series()?.id, ext: ep.ext },
      replaceUrl: true,
    });
  }

  private beginCountdown() {
    this.countdown.set(AUTOPLAY_COUNTDOWN);
    this.countdownTimer = setInterval(() => {
      const n = (this.countdown() ?? 1) - 1;
      if (n <= 0) {
        this.cancelCountdown();
        this.goEpisode(this.nextEpisode());
      } else this.countdown.set(n);
    }, 1000);
  }

  cancelCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.countdown.set(null);
  }

  /* ================= progress ================= */

  private saveNow() {
    if (this.isLive() || !this.meta()) return;
    const v = this.videoRef()?.nativeElement;
    if (!v) return;
    const pos = this.offset() + v.currentTime;
    const dur = this.duration();
    if (pos > 5) this.library.saveProgress(this.kind(), this.id(), pos, dur);
  }

  @HostListener('window:beforeunload')
  onUnload() {
    this.saveNow();
  }

  @HostListener('document:visibilitychange')
  onVisibility() {
    if (this.document.visibilityState === 'hidden') this.saveNow();
  }

  /* ================= chrome visibility ================= */

  poke() {
    this.showControls();
    this.scheduleHide();
  }

  private showControls() {
    this.controlsVisible.set(true);
  }

  private scheduleHide() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.playing() && this.menuOpen() === 'none') this.controlsVisible.set(false);
    }, HIDE_AFTER_MS);
  }

  onStageClick(ev: MouseEvent) {
    if ((ev.target as HTMLElement).closest('.controls, .topbar, .drawer, .menu, .overlay-card')) return;
    if (this.menuOpen() !== 'none') {
      this.menuOpen.set('none');
      return;
    }
    this.togglePlay();
  }

  onStageDblClick(ev: MouseEvent) {
    if ((ev.target as HTMLElement).closest('.controls, .topbar, .drawer, .menu')) return;
    void this.toggleFullscreen();
  }

  private flash(text: string) {
    this.notice.set(text);
    setTimeout(() => {
      if (this.notice() === text) this.notice.set(null);
    }, 3500);
  }

  /* ================= keyboard ================= */

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    const target = ev.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const live = this.isLive();
    switch (ev.key) {
      case ' ':
      case 'k':
        ev.preventDefault();
        this.togglePlay();
        break;
      case 'ArrowLeft':
        if (!live) this.seekBy(ev.shiftKey ? -60 : -10);
        break;
      case 'ArrowRight':
        if (!live) this.seekBy(ev.shiftKey ? 60 : 10);
        break;
      case 'j':
        if (!live) this.seekBy(-10);
        break;
      case 'l':
        if (!live) this.seekBy(10);
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (live) this.stepChannel(-1);
        else this.video.volume = Math.min(1, this.video.volume + 0.1);
        break;
      case 'ArrowDown':
        ev.preventDefault();
        if (live) this.stepChannel(1);
        else this.video.volume = Math.max(0, this.video.volume - 0.1);
        break;
      case 'PageUp':
        if (live) this.stepChannel(-1);
        break;
      case 'PageDown':
        if (live) this.stepChannel(1);
        break;
      case 'f':
        void this.toggleFullscreen();
        break;
      case 'm':
        this.toggleMute();
        break;
      case 'p':
        void this.togglePip();
        break;
      case 'c':
        if (live) this.toggleMenu('channels');
        break;
      case 'n':
        if (this.kind() === 'series') this.goEpisode(this.nextEpisode());
        break;
      case 'Escape':
        if (this.menuOpen() !== 'none') this.menuOpen.set('none');
        else if (!this.document.fullscreenElement) this.back();
        break;
      default:
        return;
    }
    this.poke();
  }

  readonly rates = [0.75, 1, 1.25, 1.5, 2];
  readonly levelLabel = (l: Level) => (l.height ? `${l.height}p` : `${Math.round((l.bitrate || 0) / 1000)} kbps`);
  readonly pad = (n: number) => String(n).padStart(2, '0');
}
