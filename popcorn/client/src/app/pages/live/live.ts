import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { LibraryService } from '../../core/library.service';
import { Category, LiveChannel } from '../../core/models';
import { ChannelCard } from '../../shared/channel-card';
import { Icon } from '../../shared/icon';

interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

@Component({
  selector: 'app-live',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ChannelCard, Icon],
  templateUrl: './live.html',
  styleUrl: './live.css',
})
export class LivePage {
  private api = inject(ApiService);
  private router = inject(Router);
  readonly library = inject(LibraryService);

  readonly view = computed(() => this.library.settings().liveView);
  setView(v: 'grid' | 'list') {
    this.library.updateSettings({ liveView: v });
  }

  /** Bound from the route (:category). */
  readonly category = input<string>();

  readonly query = signal('');
  readonly catFilter = signal('');

  readonly categories = toSignal(
    this.api.categories('live').pipe(
      map((data): Loaded<Category[]> => ({ data, error: null, loading: false })),
      catchError((err) => of<Loaded<Category[]>>({ data: null, error: describe(err), loading: false })),
      startWith<Loaded<Category[]>>({ data: null, error: null, loading: true }),
    ),
    { initialValue: { data: null, error: null, loading: true } as Loaded<Category[]> },
  );

  readonly filteredCategories = computed(() => {
    const list = this.categories().data ?? [];
    const q = this.catFilter().trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  });

  readonly current = computed(() => {
    const id = this.category();
    return this.categories().data?.find((c) => c.id === id) ?? null;
  });

  readonly channels = toSignal(
    toObservable(this.category).pipe(
      switchMap((id) => {
        if (!id) return of<Loaded<LiveChannel[]>>({ data: [], error: null, loading: false });
        return this.api.streams('live', id).pipe(
          map((data): Loaded<LiveChannel[]> => ({ data, error: null, loading: false })),
          catchError((err) => of<Loaded<LiveChannel[]>>({ data: null, error: describe(err), loading: false })),
          startWith<Loaded<LiveChannel[]>>({ data: null, error: null, loading: true }),
        );
      }),
    ),
    { initialValue: { data: null, error: null, loading: true } as Loaded<LiveChannel[]> },
  );

  readonly visible = computed(() => {
    const list = this.channels().data ?? [];
    const q = this.query().trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  });

  constructor() {
    // Land on the first category when none is selected.
    effect(() => {
      const cats = this.categories().data;
      const id = this.category();
      if (cats?.length && !id) {
        untracked(() => this.router.navigate(['/live', cats[0]!.id], { replaceUrl: true }));
      }
    });
  }

  readonly skeletons = Array.from({ length: 12 });
}

export function describe(err: unknown): string {
  const e = err as { error?: { error?: string }; status?: number; message?: string };
  if (e?.error?.error) return e.error.error;
  if (e?.status === 0) return 'The Popcorn server is not reachable.';
  return e?.message || 'Something went wrong.';
}
