import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { humanDuration } from '../../core/format';
import { LibraryService, isResumable } from '../../core/library.service';
import { Episode, SeriesInfo } from '../../core/models';
import { Artwork } from '../../shared/artwork';
import { Icon } from '../../shared/icon';
import { describe } from '../live/live';

@Component({
  selector: 'app-series-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Artwork, Icon],
  templateUrl: './series-detail.html',
  styleUrl: '../detail.css',
})
export class SeriesDetailPage {
  private api = inject(ApiService);
  readonly library = inject(LibraryService);

  readonly id = input.required<string>();
  readonly season = signal<number | null>(null);

  readonly state = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) =>
        this.api.seriesInfo(id).pipe(
          map((data) => ({ data, error: null as string | null })),
          catchError((err) => of({ data: null as SeriesInfo | null, error: describe(err) })),
          startWith({ data: null as SeriesInfo | null, error: null as string | null }),
        ),
      ),
    ),
    { initialValue: { data: null as SeriesInfo | null, error: null as string | null } },
  );

  readonly show = computed(() => this.state().data);
  readonly isFav = computed(() => this.library.isFavorite('series', this.id()));

  readonly currentSeason = computed(() => {
    const s = this.show();
    if (!s) return null;
    const n = this.season();
    return s.seasons.find((x) => x.number === n) ?? s.seasons[0] ?? null;
  });

  readonly episodeCount = computed(() => this.show()?.seasons.reduce((n, s) => n + s.episodes.length, 0) ?? 0);

  readonly meta = computed(() => {
    const s = this.show();
    if (!s) return [];
    const out: string[] = [];
    if (s.year) out.push(String(s.year));
    const seasons = s.seasons.filter((x) => x.number > 0).length || s.seasons.length;
    out.push(`${seasons} season${seasons === 1 ? '' : 's'}`);
    out.push(`${this.episodeCount()} episodes`);
    if (s.genre) out.push(s.genre);
    if (s.rating) out.push(`★ ${s.rating.toFixed(1)}`);
    return out;
  });

  /** The episode to offer on the main button: in-progress one, else first unwatched, else the first. */
  readonly upNext = computed(() => {
    const s = this.show();
    if (!s) return null;
    const all = s.seasons.flatMap((x) => x.episodes);
    const prog = this.library.progress();
    const inProgress = all
      .map((e) => ({ e, p: prog[`series:${e.id}`] }))
      .filter(({ p }) => isResumable(p))
      .sort((a, b) => (b.p!.updatedAt ?? 0) - (a.p!.updatedAt ?? 0))[0];
    if (inProgress) return { episode: inProgress.e, resume: true };
    const firstUnwatched = all.find((e) => !this.isWatched(e));
    return firstUnwatched ? { episode: firstUnwatched, resume: false } : all[0] ? { episode: all[0], resume: false } : null;
  });

  constructor() {
    // Open the season of the up-next episode.
    effect(() => {
      const n = this.upNext();
      if (n && this.season() === null) untracked(() => this.season.set(n.episode.season));
    });
  }

  progressPct(e: Episode): number | null {
    const p = this.library.getProgress('series', e.id);
    if (!p || !p.duration || p.position < 30) return null;
    const pct = (p.position / p.duration) * 100;
    return pct >= 95 ? null : pct;
  }

  isWatched(e: Episode): boolean {
    const p = this.library.getProgress('series', e.id);
    return !!p && p.duration > 0 && p.position / p.duration >= 0.95;
  }

  epMeta(e: Episode): string {
    const out: string[] = [];
    if (e.durationSecs) out.push(humanDuration(e.durationSecs));
    else if (e.duration) out.push(e.duration);
    if (e.aired) out.push(e.aired);
    if (e.rating) out.push(`★ ${e.rating.toFixed(1)}`);
    return out.join(' · ');
  }

  watchQuery(e: Episode) {
    return { series: this.id(), ext: e.ext };
  }

  toggleFav() {
    const s = this.show();
    if (!s) return;
    this.library.toggleFavorite({ kind: 'series', id: s.id, title: s.title, image: s.poster, parentId: s.id });
  }

  trailerUrl() {
    const t = this.show()?.trailer;
    if (!t) return null;
    return /^https?:/i.test(t) ? t : `https://www.youtube.com/watch?v=${t}`;
  }

  pad(n: number) {
    return String(n).padStart(2, '0');
  }
}
