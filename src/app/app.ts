import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Tv } from './components/tv/tv';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Tv],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('iptv-viewer');
}
