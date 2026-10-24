import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { clock, humanDuration } from '../../core/format';
import { LibraryService, isResumable } from '../../core/library.service';
import { MovieInfo } from '../../core/models';
import { Artwork } from '../../shared/artwork';
import { Icon } from '../../shared/icon';
import { describe } from '../live/live';

@Component({
  selector: 'app-movie-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Artwork, Icon],
  templateUrl: './movie-detail.html',
  styleUrl: '../detail.css',
})
export class MovieDetailPage {
  private api = inject(ApiService);
  readonly library = inject(LibraryService);

  readonly id = input.required<string>();

  readonly state = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) =>
        this.api.movieInfo(id).pipe(
          map((data) => ({ data, error: null as string | null })),
          catchError((err) => of({ data: null as MovieInfo | null, error: describe(err) })),
          startWith({ data: null as MovieInfo | null, error: null as string | null }),
        ),
      ),
    ),
    { initialValue: { data: null as MovieInfo | null, error: null as string | null } },
  );

  readonly movie = computed(() => this.state().data);
  readonly isFav = computed(() => this.library.isFavorite('movie', this.id()));
  readonly progress = computed(() => this.library.getProgress('movie', this.id()));
  readonly resumable = computed(() => isResumable(this.progress()));

  readonly meta = computed(() => {
    const m = this.movie();
    if (!m) return [];
    const out: string[] = [];
    if (m.year) out.push(String(m.year));
    if (m.durationSecs) out.push(humanDuration(m.durationSecs));
    else if (m.duration) out.push(m.duration);
    if (m.genre) out.push(m.genre);
    if (m.rating) out.push(`★ ${m.rating.toFixed(1)}`);
    out.push(m.ext.toUpperCase());
    return out;
  });

  readonly resumeLabel = computed(() => {
    const p = this.progress();
    return p ? `Resume from ${clock(p.position)}` : 'Play';
  });

  toggleFav() {
    const m = this.movie();
    if (!m) return;
    this.library.toggleFavorite({ kind: 'movie', id: m.id, title: m.title, image: m.poster, ext: m.ext });
  }

  trailerUrl() {
    const t = this.movie()?.trailer;
    if (!t) return null;
    return /^https?:/i.test(t) ? t : `https://www.youtube.com/watch?v=${t}`;
  }
}
