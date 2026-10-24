import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Signal,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EpgService, NowNext, progressOf } from '../core/epg.service';
import { timeOfDay } from '../core/format';
import { LibraryService } from '../core/library.service';
import { LiveChannel } from '../core/models';
import { Artwork } from './artwork';
import { Icon } from './icon';

/**
 * A live channel: logo, name, and what's on right now with a progress bar.
 * `layout="tile"` is a card for grids; `layout="row"` is a full-width list row
 * that never truncates the name — better for event channels with long titles.
 */
@Component({
  selector: 'app-channel-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Artwork, Icon],
  host: { '[class.playing]': 'active()', '[class.row]': 'layout() === "row"' },
  template: `
    <a class="tile" [routerLink]="['/watch/live', channel().id]" [queryParams]="{ category: categoryId() }"
      [attr.title]="channel().title">
      <div class="logo">
        <app-artwork [src]="channel().icon" [alt]="channel().title" fit="contain" />
      </div>
      <div class="body">
        <div class="name">{{ channel().title }}</div>
        @let e = epg();
        @if (e?.now; as now) {
          <div class="now">{{ now.title }} <span class="at">· until {{ at(now.end) }}</span></div>
          <div class="bar"><span [style.width.%]="pct()"></span></div>
          @if (e?.next; as next) {
            <div class="next">Next: {{ next.title }} <span class="at">{{ at(next.start) }}</span></div>
          }
        }
      </div>
      @if (active()) {
        <span class="on-air" title="Now playing"><app-icon name="signal" [size]="14" /></span>
      }
    </a>
    <button class="fav" type="button" (click)="toggleFav($event)"
      [class.on]="isFav()" [attr.aria-pressed]="isFav()"
      [attr.aria-label]="isFav() ? 'Remove from favorites' : 'Add to favorites'">
      <app-icon name="heart" [filled]="isFav()" [size]="15" />
    </button>
  `,
  styles: `
    :host { display: block; position: relative; }
    .tile {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 12px;
      align-items: center;
      padding: 10px 12px 10px 10px;
      min-height: 84px;
      border-radius: var(--radius-m);
      background: var(--bg-raised);
      border: 1px solid var(--line);
      transition: background 0.15s var(--ease), border-color 0.15s var(--ease);
    }
    .tile:hover { background: var(--surface); border-color: var(--line-strong); }
    :host.playing .tile { border-color: var(--accent); }
    .logo { width: 72px; height: 54px; border-radius: 8px; overflow: hidden; background: #0f0d0b; }
    .body { min-width: 0; }
    .name {
      font-weight: 700; font-size: 14px; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      overflow-wrap: anywhere;
    }
    :host:hover .name, :host:has(.fav.on) .name { padding-right: 26px; }
    .now { font-size: 12.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px; }
    .next { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px; }
    .at { color: var(--faint); }
    .bar { height: 3px; background: var(--line); border-radius: 2px; margin-top: 6px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--accent); }
    .on-air { position: absolute; left: 14px; top: 14px; color: var(--accent); }
    .fav {
      position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%;
      display: grid; place-items: center; color: var(--muted); background: var(--bg-raised);
      opacity: 0; transition: opacity 0.15s ease, color 0.15s ease;
    }
    .fav:hover { color: var(--text); background: var(--surface-hover); }
    :host:hover .fav, .fav:focus-visible, .fav.on { opacity: 1; }
    .fav.on { color: var(--accent); }
    @media (hover: none) { .fav { opacity: 1; } }

    /* ----- row layout ----- */
    :host.row .tile {
      grid-template-columns: 56px minmax(0, 1fr);
      min-height: 0;
      padding: 8px 12px 8px 8px;
      border-radius: var(--radius-s);
      border-color: transparent;
      background: transparent;
    }
    :host.row .tile:hover { background: var(--bg-raised); border-color: var(--line); }
    :host.row.playing .tile { border-color: var(--accent); }
    :host.row .logo { width: 56px; height: 40px; border-radius: 6px; }
    :host.row .body {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      grid-template-areas: 'name now' 'name next';
      column-gap: 20px;
      align-items: center;
    }
    :host.row .name { grid-area: name; font-size: 14.5px; -webkit-line-clamp: 2; }
    :host.row .now { grid-area: now; margin: 0; }
    :host.row .bar { display: none; }
    :host.row .next { grid-area: next; margin-top: 2px; }
    :host.row .on-air { left: 10px; top: 10px; }
    :host.row .fav { top: 50%; transform: translateY(-50%); right: 10px; }
    @media (max-width: 760px) {
      :host.row .body { grid-template-columns: 1fr; grid-template-areas: 'name' 'now'; }
      :host.row .next { display: none; }
    }
  `,
})
export class ChannelCard {
  private epgService = inject(EpgService);
  private library = inject(LibraryService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  readonly channel = input.required<LiveChannel>();
  readonly categoryId = input<string | null>(null);
  readonly active = input<boolean>(false);
  readonly layout = input<'tile' | 'row'>('tile');

  private readonly epgSource = signal<Signal<NowNext> | null>(null);
  readonly epg = computed(() => this.epgSource()?.() ?? null);
  readonly pct = computed(() => Math.round(progressOf(this.epg()?.now ?? null) * 100));
  readonly isFav = computed(() => this.library.isFavorite('live', this.channel().id));
  readonly at = timeOfDay;

  constructor() {
    // Only ask for guide data once the tile is actually on screen.
    afterNextRender(() => {
      if (!('IntersectionObserver' in window)) {
        this.bind();
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            this.bind();
            io.disconnect();
          }
        },
        { rootMargin: '200px' },
      );
      io.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => io.disconnect());
    });
  }

  private bind() {
    this.epgSource.set(this.epgService.watch(this.channel().id));
  }

  toggleFav(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    const c = this.channel();
    this.library.toggleFavorite({ kind: 'live', id: c.id, title: c.title, image: c.icon, parentId: c.categoryId });
  }
}
