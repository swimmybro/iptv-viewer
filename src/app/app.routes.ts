import { Routes } from '@angular/router';
import { Tv } from './components/tv/tv';
import { TvCategory } from './components/tv-category/tv-category';
import { TvStream } from './components/tv-stream/tv-stream';
import { SeriesInfo } from './components/series-info/series-info';

export const routes: Routes = [
  { path: '', redirectTo: 'tv', pathMatch: 'full' },
  { path: 'tv', component: Tv },
  { path: 'tv/:id', component: TvCategory },
  { path: 'tv/:id/stream/:streamid', component: TvStream },
  { path: 'movies', component: Tv },
  { path: 'movies/:id', component: TvCategory },
  { path: 'movies/:id/stream/:streamid', component: TvStream },
  { path: 'shows', component: Tv },
  { path: 'shows/:id', component: TvCategory },
  { path: 'shows/:id/info/:seriesid', component: SeriesInfo },
  { path: 'shows/:id/info/:seriesid/stream/:streamid', component: TvStream },
];
