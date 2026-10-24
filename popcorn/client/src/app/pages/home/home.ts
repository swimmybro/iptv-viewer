import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { clock } from '../../core/format';
import { LibraryService, refKey } from '../../core/library.service';
import { LibraryRef } from '../../core/models';
import { Artwork } from '../../shared/artwork';
import { Icon } from '../../shared/icon';
import { PosterCard } from '../../shared/poster-card';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Artwork, Icon, PosterCard],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomePage {
  private api = inject(ApiService);
  readonly library = inject(LibraryService);

  readonly continueWatching = this.library.continueWatching;
  readonly favoriteChannels = computed(() => this.library.favorites().filter((f) => f.kind === 'live').slice(0, 12));
  readonly favoriteShows = computed(() => this.library.favorites().filter((f) => f.kind !== 'live').slice(0, 12));
  readonly recentChannels = computed(() => this.library.recents().filter((r) => r.kind === 'live').slice(0, 12));
  readonly isEmpty = computed(
    () =>
      !this.continueWatching().length &&
      !this.favoriteChannels().length &&
      !this.favoriteShows().length &&
      !this.recentChannels().length,
  );

  readonly counts = toSignal(
    this.api.account().pipe(catchError(() => of(null))),
    { initialValue: undefined },
  );

  readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  watchLink(ref: LibraryRef): unknown[] {
    return ['/watch', ref.kind, ref.id];
  }

  watchQuery(ref: LibraryRef) {
    if (ref.kind === 'series') return { series: ref.parentId, ext: ref.ext };
    if (ref.kind === 'live') return { category: ref.parentId };
    return { ext: ref.ext };
  }

  detailLink(ref: LibraryRef): unknown[] {
    if (ref.kind === 'movie') return ['/movie', ref.id];
    if (ref.kind === 'series') return ['/show', ref.parentId ?? ref.id];
    return ['/watch/live', ref.id];
  }

  remaining(ref: LibraryRef) {
    const p = this.library.progress()[refKey(ref.kind, ref.id)];
    if (!p?.duration) return '';
    return `${clock(p.duration - p.position)} left`;
  }

  completion(ref: LibraryRef) {
    const p = this.library.progress()[refKey(ref.kind, ref.id)];
    return p?.duration ? p.position / p.duration : null;
  }

  remove(ref: LibraryRef, ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    this.library.removeRecent(ref.kind, ref.id);
  }
}
