import { Component, inject, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
  router = inject(Router);
  streamUrl?: string;
  path = '';

  constructor(private http: HttpClient) {
    this.path = this.router.url.split('/')[1];
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('streamid');
    if (!id) return;

    // const apiUrl = `http://chips49880.cdngold.me/player_api.php?username=3517bro&password=14c3050f37&action=get_short_epg&stream_id=${id}.m3u8`;
    if (this.path === 'tv') {
      this.streamUrl = `/stream/live/3517/864c1b1220/${id}.m3u8`;
      const apiUrl = `http://cf.business-cdn-8k.ru:80/live/3517/864c1b1220/${id}.ts`;
    } else {
      this.streamUrl = `/stream/movie/3517/864c1b1220/${id}.mkv`;
      const apiUrl = `http://cf.business-cdn-8k.ru:80/movie/3517/864c1b1220/${id}.ts`;
    }

    // this.http.get(apiUrl).subscribe(url => {
    //   console.log(url)
    // });
  }

  ngAfterViewInit() {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (!video || !this.streamUrl) return;

    let ldi = false;

    if (this.path === 'tv') {
      ldi = true;
    }

    if (this.streamUrl.endsWith('.mp4') || this.streamUrl.endsWith('.mkv')) {
      video.src = this.streamUrl;
      video.load();
      return;
    }

    // ✅ Use HLS.js for live streaming playback
    if (Hls.isSupported()) {
      const hls = new Hls({
        liveDurationInfinity: ldi, // Keeps it live
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
