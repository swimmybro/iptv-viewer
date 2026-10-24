import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LibraryService } from '../../core/library.service';
import { LibraryRef } from '../../core/models';
import { Artwork } from '../../shared/artwork';
import { Icon } from '../../shared/icon';
import { PosterCard } from '../../shared/poster-card';

@Component({
  selector: 'app-favorites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Artwork, Icon, PosterCard],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Favorites</h1>
          <p class="lead">Saved in this browser. Use the heart on any channel, movie or series.</p>
        </div>
      </header>

      @if (!library.favorites().length) {
        <div class="empty">
          <h3>No favorites yet</h3>
          <p>Hover a channel or poster and press the heart to keep it here.</p>
        </div>
      }

      @if (channels().length) {
        <section class="section" style="margin-top: 0">
          <div class="section-head"><h2>Channels</h2></div>
          <div class="grid channels">
            @for (c of channels(); track c.id) {
              <div class="fav-chan">
                <a class="tile" [routerLink]="['/watch/live', c.id]" [queryParams]="{ category: c.parentId }">
                  <div class="logo"><app-artwork [src]="c.image" [alt]="c.title" fit="contain" /></div>
                  <div class="name">{{ c.title }}</div>
                </a>
                <button type="button" class="unfav" (click)="remove(c)" aria-label="Remove from favorites">
                  <app-icon name="heart" [filled]="true" [size]="15" />
                </button>
              </div>
            }
          </div>
        </section>
      }

      @if (movies().length) {
        <section class="section">
          <div class="section-head"><h2>Movies</h2></div>
          <div class="grid">
            @for (m of movies(); track m.id) {
              <app-poster-card kind="movie" [id]="m.id" [title]="m.title" [image]="m.image" [link]="['/movie', m.id]" />
            }
          </div>
        </section>
      }

      @if (series().length) {
        <section class="section">
          <div class="section-head"><h2>Series</h2></div>
          <div class="grid">
            @for (s of series(); track s.id) {
              <app-poster-card kind="series" [id]="s.id" [title]="s.title" [image]="s.image" [link]="['/show', s.id]" />
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .fav-chan { position: relative; }
    .tile {
      display: grid; grid-template-columns: 72px 1fr; gap: 12px; align-items: center;
      padding: 10px; min-height: 74px; border-radius: var(--radius-m);
      background: var(--bg-raised); border: 1px solid var(--line);
    }
    .tile:hover { background: var(--surface); border-color: var(--line-strong); }
    .logo { width: 72px; height: 54px; border-radius: 8px; overflow: hidden; background: #0f0d0b; }
    .name { font-weight: 700; font-size: 14px; padding-right: 28px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .unfav {
      position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%;
      display: grid; place-items: center; color: var(--accent);
    }
    .unfav:hover { background: var(--surface-hover); }
  `,
})
export class FavoritesPage {
  readonly library = inject(LibraryService);
  readonly channels = computed(() => this.library.favorites().filter((f) => f.kind === 'live'));
  readonly movies = computed(() => this.library.favorites().filter((f) => f.kind === 'movie'));
  readonly series = computed(() => this.library.favorites().filter((f) => f.kind === 'series'));

  remove(ref: LibraryRef) {
    this.library.toggleFavorite(ref);
  }
}
