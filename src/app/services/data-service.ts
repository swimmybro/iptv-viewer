import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  // private tvUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_live_categories';

  // private movieUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_vod_categories';

  // private tvCatUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_live_streams&category_id=';

  // private tvStreamUrl = 'http://chips49880.cdngold.me//player_api.php?username=3517bro&password=14c3050f37&action=get_short_epg&stream_id=';

  private tvUrl =
    'http://cf.business-cdn-8k.ru///player_api.php?username=3517&password=864c1b1220&action=get_live_categories';

  private tvCatUrl =
    'http://cf.business-cdn-8k.ru///player_api.php?username=3517&password=864c1b1220&action=get_live_streams&category_id=';

  private tvStreamUrl =
    'http://cf.business-cdn-8k.ru///player_api.php?username=3517&password=864c1b1220&action=get_short_epg&stream_id=';

  private movieUrl =
    'http://cf.business-cdn-8k.ru///player_api.php?username=3517&password=864c1b1220&action=get_vod_categories';

  private movieCatUrl =
    'http://cf.business-cdn-8k.ru///player_api.php?username=3517&password=864c1b1220&action=get_vod_streams&category_id=';

  constructor(private http: HttpClient) {}

  getTVCategories() {
    return this.http.get<any[]>(`${this.tvUrl}`);
  }

  getMovieCategories() {
    return this.http.get<any[]>(`${this.movieUrl}`);
  }

  getMovieCategoryData(id: any) {
    return this.http.get<any[]>(`${this.movieCatUrl}${id}`);
  }

  getTvCategoryData(id: any) {
    return this.http.get<any[]>(`${this.tvCatUrl}${id}`);
  }

  getTvStream(id: any) {
    return this.http.get<any[]>(`${this.tvStreamUrl}${id}`);
  }
}
