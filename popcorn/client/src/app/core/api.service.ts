import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import {
  Account,
  Capabilities,
  CatalogItem,
  Category,
  EpgEntry,
  Kind,
  LiveChannel,
  LiveProbe,
  Movie,
  MovieInfo,
  SearchResults,
  Series,
  SeriesInfo,
} from './models';

type ItemOf<K extends Kind> = K extends 'live' ? LiveChannel : K extends 'movie' ? Movie : Series;

/**
 * Thin typed wrapper over the Popcorn server API with a small per-session memo
 * so navigating back and forth between pages doesn't refetch the same lists.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private memo = new Map<string, Observable<unknown>>();

  private cached<T>(key: string, make: () => Observable<T>): Observable<T> {
    let obs = this.memo.get(key) as Observable<T> | undefined;
    if (!obs) {
      obs = make().pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.memo.set(key, obs);
      // Drop the memo on error so a retry can happen.
      obs.subscribe({ error: () => this.memo.delete(key) });
    }
    return obs;
  }

  clearMemo() {
    this.memo.clear();
  }

  capabilities() {
    return this.cached('caps', () => this.http.get<Capabilities>('/api/capabilities'));
  }

  account() {
    return this.cached('account', () => this.http.get<Account>('/api/account'));
  }

  categories(kind: Kind) {
    return this.cached(`cats:${kind}`, () => this.http.get<Category[]>(`/api/categories/${kind}`));
  }

  streams<K extends Kind>(kind: K, categoryId?: string): Observable<ItemOf<K>[]> {
    const key = `streams:${kind}:${categoryId ?? '*'}`;
    return this.cached(key, () => {
      let params = new HttpParams();
      if (categoryId) params = params.set('category', categoryId);
      return this.http.get<ItemOf<K>[]>(`/api/streams/${kind}`, { params });
    });
  }

  seriesInfo(id: string) {
    return this.cached(`series:${id}`, () => this.http.get<SeriesInfo>(`/api/series/${id}`));
  }

  movieInfo(id: string) {
    return this.cached(`movie:${id}`, () => this.http.get<MovieInfo>(`/api/movie/${id}`));
  }

  epg(streamId: string, limit = 6) {
    // Not memoised: EPG changes.
    return this.http.get<EpgEntry[]>(`/api/epg/${streamId}`, { params: { limit } });
  }

  search(q: string) {
    return this.http.get<SearchResults>('/api/search', { params: { q } });
  }

  clearServerCache() {
    this.clearMemo();
    return this.http.post<{ ok: boolean }>('/api/cache/clear', {});
  }

  /* ----- stream URLs ----- */

  liveUrl(id: string) {
    return `/stream/live/${id}.m3u8`;
  }

  liveTsUrl(id: string) {
    return `/stream/live/${id}.ts`;
  }

  /** TS stream, probed by the server, with only the parts the browser can't play converted. */
  liveTsAutoUrl(id: string, force = false) {
    return `/stream/live/auto/${id}.ts${force ? '?video=transcode&audio=transcode' : ''}`;
  }

  liveProbe(id: string) {
    return this.http.get<LiveProbe>(`/api/live/${id}/probe`);
  }

  vodProbe(kind: 'movie' | 'series', id: string, ext: string) {
    return this.http.get<LiveProbe>(`/api/vod/${kind}/${id}/${ext}/probe`);
  }

  vodUrl(kind: 'movie' | 'series', id: string, ext: string) {
    return `/stream/vod/${kind}/${id}.${ext}`;
  }

  remuxUrl(kind: 'movie' | 'series', id: string, ext: string, startSeconds = 0, transcode = false, vcodec?: string) {
    const q = new URLSearchParams();
    if (vcodec && !transcode) q.set('vcodec', vcodec);
    if (startSeconds > 0) q.set('t', String(Math.floor(startSeconds)));
    if (transcode) q.set('mode', 'transcode');
    const qs = q.toString();
    return `/stream/remux/${kind}/${id}.${ext}${qs ? `?${qs}` : ''}`;
  }
}

export function itemImage(item: CatalogItem): string | null {
  return item.kind === 'live' ? item.icon : item.poster;
}
