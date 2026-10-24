import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ApiService } from './core/api.service';
import { Icon } from './shared/icon';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '[class.bare]': '!chrome()' },
})
export class App {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  readonly nav: NavItem[] = [
    { path: '/', label: 'Home', icon: 'home', exact: true },
    { path: '/live', label: 'Live TV', icon: 'tv' },
    { path: '/movies', label: 'Movies', icon: 'film' },
    { path: '/series', label: 'Series', icon: 'series' },
    { path: '/favorites', label: 'Favorites', icon: 'heart' },
    { path: '/search', label: 'Search', icon: 'search' },
  ];

  /** The player route hides the sidebar. */
  readonly chrome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let r = this.route;
        while (r.firstChild) r = r.firstChild;
        return r.snapshot.data['chrome'] !== false;
      }),
    ),
    { initialValue: true },
  );

  readonly account = toSignal(this.api.account(), { initialValue: null });

  readonly expiry = computed(() => {
    const a = this.account();
    if (!a?.expires) return null;
    const days = Math.ceil((a.expires - Date.now()) / 86_400_000);
    if (days < 0) return { text: 'Subscription expired', warn: true };
    if (days === 0) return { text: 'Expires today', warn: true };
    if (days <= 14) return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, warn: true };
    return { text: `${days} days left`, warn: false };
  });

  readonly year = new Date().getFullYear();
}
