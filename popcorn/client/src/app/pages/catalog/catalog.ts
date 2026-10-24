import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { LibraryService } from '../../core/library.service';
import { Category, Kind, Movie, Series } from '../../core/models';
import { Icon } from '../../shared/icon';
import { PosterCard } from '../../shared/poster-card';
import { describe } from '../live/live';

type Item = Movie | Series;
interface CatState {
  data: Category[] | null;
  error: string | null;
}
type Sort = 'name' | 'year' | 'rating' | 'added';
const PAGE = 60;
const NEW = 'new';

@Component({
  selector: 'app-catalog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PosterCard, Icon],
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
})
export class CatalogPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  readonly library = inject(LibraryService);

  readonly category = input<string>();
  readonly kind = toSignal(this.route.data.pipe(map((d) => d['kind'] as Kind)), { initialValue: 'movie' as Kind });
  readonly label = computed(() => (this.kind() === 'movie' ? 'Movies' : 'Series'));
  readonly base = computed(() => (this.kind() === 'movie' ? '/movies' : '/series'));

  readonly query = signal('');
  readonly sort = signal<Sort>('name');
  readonly limit = signal(PAGE);
  readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  readonly categories = toSignal<CatState, CatState>(
    toObservable(this.kind).pipe(
      switchMap((k) =>
        this.api.categories(k).pipe(
          map((data): CatState => ({ data, error: null })),
          catchError((err) => of<CatState>({ data: null, error: describe(err) })),
        ),
      ),
    ),
    { initialValue: { data: null, error: null } },
  );

  readonly current = computed(() => {
    const id = this.category();
    if (id === NEW) return { id: NEW, name: 'Recently added', title: 'Recently added', tag: null, parentId: null } as Category;
    return this.categories().data?.find((c) => c.id === id) ?? null;
  });

  readonly items = toSignal(
    combineLatest([toObservable(this.kind), toObservable(this.category)]).pipe(
      switchMap(([k, id]) => {
        if (!id) return of({ data: [] as Item[], error: null as string | null, loading: false });
        const src = id === NEW ? this.api.streams(k as 'movie' | 'series') : this.api.streams(k as 'movie' | 'series', id);
        return src.pipe(
          map((data) => ({ data: data as Item[], error: null as string | null, loading: false })),
          catchError((err) => of({ data: null as Item[] | null, error: describe(err), loading: false })),
          startWith({ data: null as Item[] | null, error: null as string | null, loading: true }),
        );
      }),
    ),
    { initialValue: { data: null as Item[] | null, error: null as string | null, loading: true } },
  );

  readonly sorted = computed(() => {
    const list = this.items().data ?? [];
    const q = this.query().trim().toLowerCase();
    const filtered = q ? list.filter((i) => i.name.toLowerCase().includes(q)) : [...list];
    const sort = this.category() === NEW ? 'added' : this.sort();
    switch (sort) {
      case 'year':
        filtered.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title));
        break;
      case 'added':
        filtered.sort((a, b) => addedOf(b) - addedOf(a));
        break;
      default:
        filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    }
    return this.category() === NEW ? filtered.slice(0, 300) : filtered;
  });

  readonly visible = computed(() => this.sorted().slice(0, this.limit()));
  readonly hasMore = computed(() => this.sorted().length > this.limit());

  readonly sorts: { id: Sort; label: string }[] = [
    { id: 'name', label: 'A–Z' },
    { id: 'year', label: 'Newest' },
    { id: 'rating', label: 'Top rated' },
    { id: 'added', label: 'Recently added' },
  ];

  constructor() {
    effect(() => {
      const cats = this.categories().data;
      if (cats?.length && !this.category()) {
        untracked(() => this.router.navigate([this.base(), cats[0]!.id], { replaceUrl: true }));
      }
    });
    // Reset paging when the list changes.
    effect(() => {
      this.category();
      this.query();
      this.sort();
      untracked(() => this.limit.set(PAGE));
    });
    afterNextRender(() => {
      if (!('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting) && this.hasMore()) this.limit.update((n) => n + PAGE);
      });
      let observed: Element | null = null;
      const tick = () => {
        const el = this.sentinel()?.nativeElement ?? null;
        if (el !== observed) {
          if (observed) io.unobserve(observed);
          if (el) io.observe(el);
          observed = el;
        }
      };
      const timer = setInterval(tick, 400);
      this.destroyRef.onDestroy(() => {
        clearInterval(timer);
        io.disconnect();
      });
    });
  }

  detailLink(item: Item): unknown[] {
    return item.kind === 'movie' ? ['/movie', item.id] : ['/show', item.id];
  }

  subtitle(item: Item): string | null {
    const parts: string[] = [];
    if (item.year) parts.push(String(item.year));
    if (item.rating) parts.push(`★ ${item.rating.toFixed(1)}`);
    return parts.join(' · ') || null;
  }

  loadMore() {
    this.limit.update((n) => n + PAGE);
  }

  readonly skeletons = Array.from({ length: 18 });
  readonly NEW = NEW;
}

function addedOf(i: Item): number {
  return i.kind === 'movie' ? i.added ?? 0 : i.lastModified ?? 0;
}
