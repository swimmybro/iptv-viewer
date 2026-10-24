import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LibraryService } from '../core/library.service';
import { Kind } from '../core/models';
import { Artwork } from './artwork';
import { Icon } from './icon';

/**
 * A 2:3 poster for a movie or series. Shows a progress bar when partially watched
 * and a favorite toggle on hover/focus.
 */
@Component({
  selector: 'app-poster-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Artwork, Icon],
  template: `
    <a class="card" [routerLink]="link()" [attr.aria-label]="title()">
      <div class="poster">
        <app-artwork [src]="image()" [alt]="title()" />
        @if (progressPct() !== null) {
          <div class="progress" role="progressbar" [attr.aria-valuenow]="progressPct()" aria-valuemin="0" aria-valuemax="100">
            <span [style.width.%]="progressPct()"></span>
          </div>
        }
        @if (badge()) {
          <span class="badge">{{ badge() }}</span>
        }
      </div>
      <div class="meta">
        <div class="title">{{ title() }}</div>
        @if (subtitle()) {
          <div class="sub">{{ subtitle() }}</div>
        }
      </div>
    </a>
    <button class="fav" type="button" (click)="toggleFav($event)"
      [class.on]="isFav()" [attr.aria-pressed]="isFav()"
      [attr.aria-label]="isFav() ? 'Remove from favorites' : 'Add to favorites'">
      <app-icon name="heart" [filled]="isFav()" [size]="16" />
    </button>
  `,
  styles: `
    :host { display: block; position: relative; }
    .card { display: block; border-radius: var(--radius-m); }
    .poster {
      position: relative;
      aspect-ratio: 2 / 3;
      border-radius: var(--radius-m);
      overflow: hidden;
      background: var(--surface);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      transition: transform 0.18s var(--ease), box-shadow 0.18s var(--ease);
    }
    .card:hover .poster, .card:focus-visible .poster {
      transform: translateY(-3px);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), var(--shadow-pop);
    }
    .card:focus-visible { outline: none; }
    .card:focus-visible .poster { box-shadow: 0 0 0 2px var(--accent), var(--shadow-pop); }
    .progress {
      position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
      background: rgba(0, 0, 0, 0.55);
    }
    .progress span { display: block; height: 100%; background: var(--accent); }
    .badge {
      position: absolute; top: 8px; left: 8px;
      padding: 2px 7px; border-radius: 4px;
      background: rgba(20, 18, 16, 0.85); color: var(--text-2);
      font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
    }
    .meta { padding: 9px 2px 0; }
    .title {
      font-weight: 600; font-size: 13.5px; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .sub { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
    .fav {
      position: absolute; top: 8px; right: 8px;
      width: 32px; height: 32px; border-radius: 50%;
      display: grid; place-items: center;
      background: rgba(20, 18, 16, 0.8); color: var(--text);
      opacity: 0; transition: opacity 0.15s ease, color 0.15s ease;
    }
    :host:hover .fav, .fav:focus-visible, .fav.on { opacity: 1; }
    .fav.on { color: var(--accent); }
    @media (hover: none) { .fav { opacity: 1; } }
  `,
})
export class PosterCard {
  private library = inject(LibraryService);

  readonly kind = input.required<Kind>();
  readonly id = input.required<string>();
  readonly title = input.required<string>();
  readonly image = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly badge = input<string | null>(null);
  readonly link = input.required<unknown[] | string>();
  /** Optional 0..1 completion override; otherwise read from saved progress. */
  readonly completion = input<number | null>(null);

  readonly isFav = computed(() => this.library.isFavorite(this.kind(), this.id()));

  readonly progressPct = computed(() => {
    const c = this.completion();
    if (c !== null) return Math.round(c * 100);
    const p = this.library.getProgress(this.kind(), this.id());
    if (!p || !p.duration || p.position < 30) return null;
    const pct = Math.round((p.position / p.duration) * 100);
    return pct >= 95 ? null : pct;
  });

  toggleFav(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    this.library.toggleFavorite({
      kind: this.kind(),
      id: this.id(),
      title: this.title(),
      image: this.image(),
      subtitle: this.subtitle() ?? undefined,
    });
  }
}
