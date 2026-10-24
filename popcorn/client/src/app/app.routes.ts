import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/home/home').then((m) => m.HomePage), title: 'Popcorn' },
  { path: 'live', loadComponent: () => import('./pages/live/live').then((m) => m.LivePage), title: 'Live TV · Popcorn' },
  { path: 'live/:category', loadComponent: () => import('./pages/live/live').then((m) => m.LivePage), title: 'Live TV · Popcorn' },
  {
    path: 'movies',
    loadComponent: () => import('./pages/catalog/catalog').then((m) => m.CatalogPage),
    data: { kind: 'movie' },
    title: 'Movies · Popcorn',
  },
  {
    path: 'movies/:category',
    loadComponent: () => import('./pages/catalog/catalog').then((m) => m.CatalogPage),
    data: { kind: 'movie' },
    title: 'Movies · Popcorn',
  },
  {
    path: 'series',
    loadComponent: () => import('./pages/catalog/catalog').then((m) => m.CatalogPage),
    data: { kind: 'series' },
    title: 'Series · Popcorn',
  },
  {
    path: 'series/:category',
    loadComponent: () => import('./pages/catalog/catalog').then((m) => m.CatalogPage),
    data: { kind: 'series' },
    title: 'Series · Popcorn',
  },
  { path: 'movie/:id', loadComponent: () => import('./pages/movie-detail/movie-detail').then((m) => m.MovieDetailPage) },
  { path: 'show/:id', loadComponent: () => import('./pages/series-detail/series-detail').then((m) => m.SeriesDetailPage) },
  { path: 'search', loadComponent: () => import('./pages/search/search').then((m) => m.SearchPage), title: 'Search · Popcorn' },
  { path: 'favorites', loadComponent: () => import('./pages/favorites/favorites').then((m) => m.FavoritesPage), title: 'Favorites · Popcorn' },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage), title: 'Settings · Popcorn' },
  { path: 'watch/:kind/:id', loadComponent: () => import('./pages/player/player').then((m) => m.PlayerPage), data: { chrome: false } },
  { path: '**', redirectTo: '' },
];
