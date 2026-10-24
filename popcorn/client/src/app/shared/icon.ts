import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** 24×24 stroke icons. Paths are hand-drawn for this app; add more as needed. */
const ICONS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10',
  tv: 'M4 7h16v11H4zM8 21h8M12 3l3 4M12 3 9 7',
  film: 'M4 4h16v16H4zM4 9h16M4 15h16M8 4v16M16 4v16',
  series: 'M3 7h18v12H3zM8 21h8M7 11l4 2-4 2z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  heartFilled: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  search: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  chevronDown: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  exitFullscreen: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l4 4M21 9l-4 4',
  pip: 'M3 5h18v14H3zM12 11h7v6h-7z',
  skipBack: 'M12 5A7 7 0 1 1 5 12M5 12V7M5 12h5M9.5 10.5v4M13 10.5h2a1 1 0 0 1 0 2h-2m0-2v4m0-2h2l1 2',
  skipForward: 'M12 5a7 7 0 1 0 7 7M19 12V7M19 12h-5M8.5 10.5v4M12 10.5h2a1 1 0 0 1 0 2h-2m0-2v4m0-2h2l1 2',
  next: 'M6 5v14l10-7zM18 5v14',
  prev: 'M18 5v14L8 12zM6 5v14',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z',
  trash: 'M5 7h14M9 7V4h6v3M8 7l.8 13h6.4L16 7',
  external: 'M14 4h6v6M20 4l-9 9M19 14v6H4V5h6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  wrench: 'M14.5 4.5a4.5 4.5 0 0 0 5 6l-9 9a2.1 2.1 0 0 1-3-3l9-9z M19.5 10.5a4.5 4.5 0 0 1-5-6',
  signal: 'M4 18h2M9 18V13M14 18V8M19 18V4',
  popcorn:
    'M7 9l1.5 12h7L17 9M6.5 9h11M8 6a2 2 0 0 1 3.5-1.2A2.5 2.5 0 0 1 16 6a2 2 0 0 1 1.5 3M10 9l.7 12M14 9l-.7 12',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icon', '[style.--icon-size.px]': 'size()' },
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      [attr.fill]="filled() ? 'currentColor' : 'none'" stroke="currentColor"
      [attr.stroke-width]="stroke()" stroke-linecap="round" stroke-linejoin="round">
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host { display: inline-flex; width: var(--icon-size, 20px); height: var(--icon-size, 20px); flex: 0 0 auto; }
    svg { width: 100%; height: 100%; }
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly filled = input<boolean>(false);
  readonly stroke = input<number>(1.8);
  path() {
    return ICONS[this.name()] ?? ICONS['info'];
  }
}
