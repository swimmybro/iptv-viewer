import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  // private tvUrl = 'http://chips49880.cdngold.me//player_api.php?username=swimmybro&password=14c3050f37&action=get_live_categories';

  // private movieUrl = 'http://chips49880.cdngold.me//player_api.php?username=swimmybro&password=14c3050f37&action=get_vod_categories';

  // private tvCatUrl = 'http://chips49880.cdngold.me//player_api.php?username=swimmybro&password=14c3050f37&action=get_live_streams&category_id=';

  // private tvStreamUrl = 'http://chips49880.cdngold.me//player_api.php?username=swimmybro&password=14c3050f37&action=get_short_epg&stream_id=';


  private tvUrl = 'http://cf.business-cdn.me///player_api.php?username=Swimmy&password=a96b76b5f7&action=get_live_categories';

  private movieUrl = 'http://cf.business-cdn.me///player_api.php?username=Swimmy&password=a96b76b5f7&action=get_vod_categories';

  private tvCatUrl = 'http://cf.business-cdn.me///player_api.php?username=Swimmy&password=a96b76b5f7&action=get_live_streams&category_id=';

  private tvStreamUrl = 'http://cf.business-cdn.me///player_api.php?username=Swimmy&password=a96b76b5f7&action=get_short_epg&stream_id=';

  constructor(private http: HttpClient) { }

  getTVCategories() {
    return this.http.get<any[]>(`${this.tvUrl}`);
  }

  getMovieCategories() {
    return this.http.get<any[]>(`${this.movieUrl}`);
  }

  getTvCategoryData(id: any) {
    return this.http.get<any[]>(`${this.tvCatUrl}${id}`);
  }

  getTvStream(id: any) {
    return this.http.get<any[]>(`${this.tvStreamUrl}${id}`);
  }
}
