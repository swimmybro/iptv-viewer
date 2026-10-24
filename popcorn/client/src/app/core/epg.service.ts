import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { ApiService } from './api.service';
import { EpgEntry } from './models';

export interface NowNext {
  now: EpgEntry | null;
  next: EpgEntry | null;
  all: EpgEntry[];
  loaded: boolean;
}

const EMPTY: NowNext = { now: null, next: null, all: [], loaded: false };
const TTL = 120_000;
const CONCURRENCY = 6;

/**
 * On-demand EPG loader. Channel tiles ask for their listing when they scroll into
 * view; requests are queued so a big grid doesn't fire a hundred fetches at once.
 */
@Injectable({ providedIn: 'root' })
export class EpgService {
  private api = inject(ApiService);
  private cache = new Map<string, { sig: WritableSignal<NowNext>; at: number }>();
  private queue: string[] = [];
  private inFlight = 0;

  /** Returns a signal that fills in once the listing arrives. */
  watch(streamId: string): WritableSignal<NowNext> {
    const hit = this.cache.get(streamId);
    const now = Date.now();
    if (hit && now - hit.at < TTL) return hit.sig;

    const sig = hit?.sig ?? signal<NowNext>(EMPTY);
    this.cache.set(streamId, { sig, at: now });
    if (!this.queue.includes(streamId)) this.queue.push(streamId);
    this.pump();
    return sig;
  }

  /** Fetch immediately (used by the player). */
  load(streamId: string, limit = 8) {
    const sig = this.cache.get(streamId)?.sig ?? signal<NowNext>(EMPTY);
    this.cache.set(streamId, { sig, at: Date.now() });
    this.api.epg(streamId, limit).subscribe({
      next: (list) => sig.set(fold(list)),
      error: () => sig.set({ ...EMPTY, loaded: true }),
    });
    return sig;
  }

  private pump() {
    while (this.inFlight < CONCURRENCY && this.queue.length) {
      const id = this.queue.shift()!;
      const entry = this.cache.get(id);
      if (!entry) continue;
      this.inFlight++;
      this.api.epg(id, 4).subscribe({
        next: (list) => entry.sig.set(fold(list)),
        error: () => entry.sig.set({ ...EMPTY, loaded: true }),
        complete: () => {
          this.inFlight--;
          this.pump();
        },
      });
    }
  }
}

export function fold(list: EpgEntry[]): NowNext {
  const t = Date.now();
  const sorted = [...list].sort((a, b) => a.start - b.start);
  let now = sorted.find((e) => e.start <= t && e.end > t) ?? sorted.find((e) => e.nowPlaying) ?? null;
  const next = sorted.find((e) => e.start > t) ?? (now ? sorted[sorted.indexOf(now) + 1] ?? null : null);
  return { now, next, all: sorted, loaded: true };
}

export function progressOf(e: EpgEntry | null, at = Date.now()): number {
  if (!e || e.end <= e.start) return 0;
  return Math.min(1, Math.max(0, (at - e.start) / (e.end - e.start)));
}
