import { Routes } from '@angular/router';
import { Tv } from './components/tv/tv';
import { TvCategory } from './components/tv-category/tv-category';
import { TvStream } from './components/tv-stream/tv-stream';

export const routes: Routes = [
  { path: '', redirectTo: 'tv', pathMatch: 'full' },
  { path: 'tv', component: Tv },
  { path: 'tv/:id', component: TvCategory },
  { path: 'tv/:id/stream/:streamid', component: TvStream },
  { path: 'movie', component: Tv },
  { path: 'movie/:id', component: TvCategory },
  { path: 'movie/:id/stream/:streamid', component: TvStream },
];
