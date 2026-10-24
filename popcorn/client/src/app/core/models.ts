export type Kind = 'live' | 'movie' | 'series';

export interface Category {
  id: string;
  name: string;
  title: string;
  tag: string | null;
  parentId: number | null;
}

export interface LiveChannel {
  kind: 'live';
  id: string;
  name: string;
  title: string;
  tag: string | null;
  icon: string | null;
  epgChannelId: string | null;
  categoryId: string;
  archive: boolean;
  archiveDays: number;
  num: number;
  added: number | null;
}

export interface Movie {
  kind: 'movie';
  id: string;
  name: string;
  title: string;
  tag: string | null;
  poster: string | null;
  rating: number | null;
  ext: string;
  categoryId: string;
  added: number | null;
  year: number | null;
}

export interface Series {
  kind: 'series';
  id: string;
  name: string;
  title: string;
  tag: string | null;
  poster: string | null;
  backdrop: string | null;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string | null;
  rating: number | null;
  runtime: string | null;
  trailer: string | null;
  categoryId: string;
  lastModified: number | null;
  year: number | null;
}

export type CatalogItem = LiveChannel | Movie | Series;

export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  ext: string;
  still: string | null;
  plot: string;
  aired: string | null;
  rating: number | null;
  durationSecs: number | null;
  duration: string | null;
}

export interface Season {
  number: number;
  name: string;
  overview: string;
  cover: string | null;
  airDate: string | null;
  episodes: Episode[];
}

export interface SeriesInfo extends Omit<Series, 'lastModified'> {
  seasons: Season[];
}

export interface MovieInfo {
  id: string;
  kind: 'movie';
  name: string;
  title: string;
  ext: string;
  poster: string | null;
  backdrop: string | null;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string | null;
  year: number | null;
  rating: number | null;
  duration: string | null;
  durationSecs: number | null;
  trailer: string | null;
  categoryId: string;
  video: Record<string, unknown> | null;
  audio: Record<string, unknown> | null;
}

export interface EpgEntry {
  id: string;
  title: string;
  description: string;
  start: number;
  end: number;
  nowPlaying: boolean;
}

export interface Account {
  username: string;
  status: string;
  expires: number | null;
  trial: boolean;
  activeConnections: number;
  maxConnections: number;
  createdAt: number | null;
  timezone: string | null;
  serverTime: string | null;
}

export interface Capabilities {
  remux: boolean;
  version: string;
}

export interface LiveProbe {
  available: boolean;
  pending?: boolean;
  video?: { codec: string; width: number; height: number } | null;
  audio?: { codec: string; channels: number } | null;
  plan?: { video: 'copy' | 'try' | 'transcode' | 'none'; audio: 'copy' | 'transcode' | 'none' };
  durationSecs?: number | null;
  error?: string;
}

export interface SearchResults {
  live: LiveChannel[];
  movie: Movie[];
  series: Series[];
}

/** A compact reference to anything playable or browsable, stored in local library data. */
export interface LibraryRef {
  kind: Kind;
  id: string;
  title: string;
  image: string | null;
  /** For episodes: the parent series id. For live: the category id. */
  parentId?: string;
  /** For episodes: "S1 · E4" style label. */
  subtitle?: string;
  ext?: string;
  savedAt: number;
}

export interface Progress {
  position: number;
  duration: number;
  updatedAt: number;
}
