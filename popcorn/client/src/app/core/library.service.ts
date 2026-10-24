import { Injectable, computed, effect, signal } from '@angular/core';
import { Kind, LibraryRef, Progress } from './models';

const KEYS = {
  favorites: 'popcorn.favorites.v1',
  recents: 'popcorn.recents.v1',
  progress: 'popcorn.progress.v1',
  settings: 'popcorn.settings.v1',
} as const;

export interface Settings {
  /** 'auto' tries direct playback and falls back; 'always' remuxes MKV/AVI straight away. */
  mkvMode: 'auto' | 'always' | 'never';
  autoplayNext: boolean;
  resume: boolean;
  /** Columns density for poster grids. */
  density: 'comfortable' | 'compact';
  /** Live TV: tiles or a list. */
  liveView: 'grid' | 'list';
  /** Live streams: raw MPEG-TS (same as most set-top apps) or the provider's HLS variant. */
  liveFormat: 'ts' | 'hls';
}

const DEFAULT_SETTINGS: Settings = {
  mkvMode: 'auto',
  autoplayNext: true,
  resume: true,
  density: 'comfortable',
  liveView: 'grid',
  liveFormat: 'ts',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: run in-memory only */
  }
}

export const refKey = (kind: Kind, id: string) => `${kind}:${id}`;

/**
 * Everything personal lives here, in this browser: favorites, recently watched,
 * playback positions, and settings. Nothing is sent to the server.
 */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  readonly favorites = signal<LibraryRef[]>(readArray<LibraryRef>(KEYS.favorites));
  readonly recents = signal<LibraryRef[]>(readArray<LibraryRef>(KEYS.recents));
  readonly progress = signal<Record<string, Progress>>(read(KEYS.progress, {}));
  readonly settings = signal<Settings>(read(KEYS.settings, DEFAULT_SETTINGS));

  readonly favoriteKeys = computed(() => new Set(this.favorites().map((f) => refKey(f.kind, f.id))));

  /** Items with a saved position that is neither at the very start nor finished. */
  readonly continueWatching = computed(() => {
    const prog = this.progress();
    return this.recents()
      .filter((r) => r.kind !== 'live')
      .map((r) => ({ ref: r, progress: prog[refKey(r.kind, r.id)] }))
      .filter(({ progress }) => progress && isResumable(progress))
      .slice(0, 20);
  });

  constructor() {
    effect(() => write(KEYS.favorites, this.favorites()));
    effect(() => write(KEYS.recents, this.recents()));
    effect(() => write(KEYS.progress, this.progress()));
    effect(() => write(KEYS.settings, this.settings()));
  }

  isFavorite(kind: Kind, id: string) {
    return this.favoriteKeys().has(refKey(kind, id));
  }

  toggleFavorite(ref: Omit<LibraryRef, 'savedAt'>) {
    const key = refKey(ref.kind, ref.id);
    if (this.favoriteKeys().has(key)) {
      this.favorites.update((list) => list.filter((f) => refKey(f.kind, f.id) !== key));
      return false;
    }
    this.favorites.update((list) => [{ ...ref, savedAt: Date.now() }, ...list]);
    return true;
  }

  touchRecent(ref: Omit<LibraryRef, 'savedAt'>) {
    const key = refKey(ref.kind, ref.id);
    this.recents.update((list) => [
      { ...ref, savedAt: Date.now() },
      ...list.filter((r) => refKey(r.kind, r.id) !== key),
    ].slice(0, 60));
  }

  removeRecent(kind: Kind, id: string) {
    const key = refKey(kind, id);
    this.recents.update((list) => list.filter((r) => refKey(r.kind, r.id) !== key));
    this.progress.update((p) => {
      const { [key]: _drop, ...rest } = p;
      return rest;
    });
  }

  getProgress(kind: Kind, id: string): Progress | undefined {
    return this.progress()[refKey(kind, id)];
  }

  saveProgress(kind: Kind, id: string, position: number, duration: number) {
    if (!Number.isFinite(position) || position < 0) return;
    const key = refKey(kind, id);
    this.progress.update((p) => ({ ...p, [key]: { position, duration, updatedAt: Date.now() } }));
  }

  markFinished(kind: Kind, id: string) {
    const key = refKey(kind, id);
    this.progress.update((p) => {
      const cur = p[key];
      return { ...p, [key]: { position: cur?.duration ?? 0, duration: cur?.duration ?? 0, updatedAt: Date.now() } };
    });
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  clearHistory() {
    this.recents.set([]);
    this.progress.set({});
  }
}

export function isResumable(p: Progress | undefined): p is Progress {
  if (!p) return false;
  if (p.position < 30) return false;
  if (p.duration > 0 && p.position / p.duration > 0.95) return false;
  return true;
}
