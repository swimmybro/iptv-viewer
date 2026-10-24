import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { SearchResults } from '../../core/models';
import { ChannelCard } from '../../shared/channel-card';
import { Icon } from '../../shared/icon';
import { PosterCard } from '../../shared/poster-card';
import { describe } from '../live/live';

const EMPTY: SearchResults = { live: [], movie: [], series: [] };

@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChannelCard, PosterCard, Icon],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Search</h1>
          <p class="lead">Channels, movies and series, all at once.</p>
        </div>
      </header>

      <label class="field big">
        <app-icon name="search" [size]="20" />
        <input #box type="search" placeholder="Type a title, channel or show" [value]="query()"
          (input)="onInput($any($event.target).value)" autocomplete="off" />
        @if (query()) {
          <button type="button" class="clear" (click)="onInput(''); box.focus()" aria-label="Clear search">
            <app-icon name="close" [size]="16" />
          </button>
        }
      </label>

      @let r = results();
      @if (query().trim().length < 2) {
        <p class="hint muted">Start typing — at least two characters.</p>
      } @else if (r.loading) {
        <p class="hint muted">Searching…</p>
      } @else if (r.error) {
        <div class="error-box"><app-icon name="info" /><span>{{ r.error }}</span></div>
      } @else if (!total()) {
        <div class="empty" style="margin-top: 24px">
          <h3>No matches for “{{ query().trim() }}”</h3>
          <p>Check the spelling, or try fewer words.</p>
        </div>
      } @else {
        @if (r.data.live.length) {
          <section class="section">
            <div class="section-head"><h2>Channels <span class="muted">{{ r.data.live.length }}</span></h2></div>
            <div class="grid channels">
              @for (c of r.data.live; track c.id) {
                <app-channel-card [channel]="c" [categoryId]="c.categoryId" />
              }
            </div>
          </section>
        }
        @if (r.data.movie.length) {
          <section class="section">
            <div class="section-head"><h2>Movies <span class="muted">{{ r.data.movie.length }}</span></h2></div>
            <div class="grid">
              @for (m of r.data.movie; track m.id) {
                <app-poster-card kind="movie" [id]="m.id" [title]="m.title" [image]="m.poster"
                  [subtitle]="m.year ? '' + m.year : null" [link]="['/movie', m.id]" />
              }
            </div>
          </section>
        }
        @if (r.data.series.length) {
          <section class="section">
            <div class="section-head"><h2>Series <span class="muted">{{ r.data.series.length }}</span></h2></div>
            <div class="grid">
              @for (s of r.data.series; track s.id) {
                <app-poster-card kind="series" [id]="s.id" [title]="s.title" [image]="s.poster"
                  [subtitle]="s.year ? '' + s.year : null" [link]="['/show', s.id]" />
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .field.big { height: 52px; font-size: 17px; max-width: 720px; }
    .field.big input { font-size: 17px; }
    .clear { color: var(--muted); display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; }
    .clear:hover { color: var(--text); background: var(--surface); }
    .hint { margin-top: 16px; font-size: 14px; }
    .section-head h2 span { font-weight: 500; font-size: 15px; margin-left: 6px; }
  `,
})
export class SearchPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private box = viewChild<ElementRef<HTMLInputElement>>('box');

  readonly query = signal<string>(this.route.snapshot.queryParamMap.get('q') ?? '');

  readonly results = toSignal(
    toObservable(this.query).pipe(
      map((q) => q.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) => {
        if (q.length < 2) return of({ data: EMPTY, error: null as string | null, loading: false });
        return this.api.search(q).pipe(
          map((data) => ({ data, error: null as string | null, loading: false })),
          catchError((err) => of({ data: EMPTY, error: describe(err), loading: false })),
          startWith({ data: EMPTY, error: null as string | null, loading: true }),
        );
      }),
    ),
    { initialValue: { data: EMPTY, error: null as string | null, loading: false } },
  );

  readonly total = computed(() => {
    const d = this.results().data;
    return d.live.length + d.movie.length + d.series.length;
  });

  constructor() {
    afterNextRender(() => this.box()?.nativeElement.focus());
  }

  onInput(value: string) {
    this.query.set(value);
    this.router.navigate([], { queryParams: { q: value || null }, replaceUrl: true, queryParamsHandling: 'merge' });
  }
}
