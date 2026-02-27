import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  private user = '3517';
  private password = '864c1b1220';
  // private tvUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_live_categories';

  // private movieUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_vod_categories';

  // private tvCatUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_live_streams&category_id=';

  // private tvStreamUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_short_epg&stream_id=';

  private tvUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_live_categories`;

  private tvCatUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_live_streams&category_id=`;

  private movieUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_vod_categories`;

  private movieCatUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_vod_streams&category_id=`;

  private seriesUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_series_categories`;

  private seriesCatUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_series&category_id=`;

  private seriesInfoUrl = `/api///player_api.php?username=${this.user}&password=${this.password}&action=get_series_info&series_id=`;

  constructor(private http: HttpClient) {}

  getTVCategories() {
    return this.http.get<any[]>(`${this.tvUrl}`);
  }

  getTvCategoryData(id: any) {
    return this.http.get<any[]>(`${this.tvCatUrl}${id}`);
  }

  getMovieCategories() {
    return this.http.get<any[]>(`${this.movieUrl}`);
  }

  getMovieCategoryData(id: any) {
    return this.http.get<any[]>(`${this.movieCatUrl}${id}`);
  }

  getSeriesCategories() {
    return this.http.get<any[]>(`${this.seriesUrl}`);
  }

  getSeriesCategoryData(id: any) {
    return this.http.get<any[]>(`${this.seriesCatUrl}${id}`);
  }

  getSeriesInfo(id: any) {
    return this.http.get<any>(`${this.seriesInfoUrl}${id}`);
  }
}
