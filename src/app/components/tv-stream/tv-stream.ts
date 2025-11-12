import { Component, inject, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import Hls from 'hls.js';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-tv-stream',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tv-stream.html',
  styleUrl: './tv-stream.css',
})
export class TvStream implements OnInit, AfterViewInit {
  route = inject(ActivatedRoute);
  streamUrl?: string;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('streamid');
    if (!id) return;

    // const apiUrl = `http://chips49880.cdngold.me/player_api.php?username=swimmybro&password=14c3050f37&action=get_short_epg&stream_id=${id}.m3u8`;
    this.streamUrl = `http://chips49880.cdngold.me:80/live/swimmybro/14c3050f37/${id}.m3u8`
    const apiUrl = `http://chips49880.cdngold.me:80/live/swimmybro/14c3050f37/${id}.ts`

    // this.http.get(apiUrl).subscribe(url => {
    //   console.log(url)
    // });
  }

  ngAfterViewInit() {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (!video || !this.streamUrl) return;

    // ✅ Use HLS.js for live streaming playback
    if (Hls.isSupported()) {
      const hls = new Hls({
        liveDurationInfinity: true, // Keeps it live
        enableWorker: true,
      });

      hls.loadSource(this.streamUrl);
      hls.attachMedia(video);

      // Optional: handle errors and auto-reconnect
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS.js error', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari supports HLS natively
      video.src = this.streamUrl;
    }
  }
}
