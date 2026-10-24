import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { dateLong } from '../../core/format';
import { LibraryService, Settings } from '../../core/library.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="page narrow">
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p class="lead">Preferences are stored in this browser.</p>
        </div>
      </header>

      <section class="group">
        <h2>Playback</h2>

        <div class="row">
          <div class="row-text">
            <div class="row-title">Resume where you left off</div>
            <div class="row-sub">Movies and episodes continue from the last position.</div>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="s().resume"
            (click)="set({ resume: !s().resume })"><span></span></button>
        </div>

        <div class="row">
          <div class="row-text">
            <div class="row-title">Play next episode automatically</div>
            <div class="row-sub">When an episode ends, the next one starts after a short countdown.</div>
          </div>
          <button type="button" class="switch" role="switch" [attr.aria-checked]="s().autoplayNext"
            (click)="set({ autoplayNext: !s().autoplayNext })"><span></span></button>
        </div>

        <div class="row column">
          <div class="row-text">
            <div class="row-title">Live stream format</div>
            <div class="row-sub">
              MPEG-TS is the raw feed most set-top apps use and usually looks best. HLS is the provider's
              adaptive copy; use it if channels stutter or fail to start.
            </div>
          </div>
          <div class="segmented" role="radiogroup" aria-label="Live stream format">
            <button type="button" role="radio" [attr.aria-checked]="s().liveFormat === 'ts'"
              [class.active]="s().liveFormat === 'ts'" (click)="set({ liveFormat: 'ts' })">MPEG-TS</button>
            <button type="button" role="radio" [attr.aria-checked]="s().liveFormat === 'hls'"
              [class.active]="s().liveFormat === 'hls'" (click)="set({ liveFormat: 'hls' })">HLS</button>
          </div>
        </div>

        <div class="row column">
          <div class="row-text">
            <div class="row-title">MKV and AVI files</div>
            <div class="row-sub">
              Browsers can't play every container or audio codec. The server can convert on the fly
              with ffmpeg{{ caps()?.remux ? '' : ' — not available on this server' }}.
            </div>
          </div>
          <div class="segmented" role="radiogroup" aria-label="MKV handling">
            @for (o of mkvOptions; track o.id) {
              <button type="button" role="radio" [attr.aria-checked]="s().mkvMode === o.id"
                [class.active]="s().mkvMode === o.id" (click)="set({ mkvMode: o.id })" [disabled]="!caps()?.remux && o.id !== 'never'">
                {{ o.label }}
              </button>
            }
          </div>
        </div>

        <div class="row column">
          <div class="row-text">
            <div class="row-title">Poster size</div>
          </div>
          <div class="segmented" role="radiogroup" aria-label="Poster size">
            <button type="button" role="radio" [attr.aria-checked]="s().density === 'comfortable'"
              [class.active]="s().density === 'comfortable'" (click)="set({ density: 'comfortable' })">Comfortable</button>
            <button type="button" role="radio" [attr.aria-checked]="s().density === 'compact'"
              [class.active]="s().density === 'compact'" (click)="set({ density: 'compact' })">Compact</button>
          </div>
        </div>
      </section>

      <section class="group">
        <h2>Account</h2>
        @if (account(); as a) {
          <dl class="facts">
            <div><dt>Username</dt><dd>{{ a.username }}</dd></div>
            <div><dt>Status</dt><dd>{{ a.status }}{{ a.trial ? ' (trial)' : '' }}</dd></div>
            <div><dt>Expires</dt><dd>{{ a.expires ? fmt(a.expires) : 'Unlimited' }}</dd></div>
            <div><dt>Connections</dt><dd>{{ a.activeConnections }} of {{ a.maxConnections }} in use</dd></div>
            @if (a.timezone) {
              <div><dt>Provider time zone</dt><dd>{{ a.timezone }}</dd></div>
            }
          </dl>
        } @else {
          <p class="muted">Account details aren't available right now.</p>
        }
      </section>

      <section class="group">
        <h2>Data</h2>
        <div class="row">
          <div class="row-text">
            <div class="row-title">Refresh the catalog</div>
            <div class="row-sub">Clears the server's cached channel and movie lists so new titles show up.</div>
          </div>
          <button type="button" class="btn" (click)="refresh()" [disabled]="busy()">
            <app-icon name="refresh" [size]="16" /> {{ refreshed() ? 'Refreshed' : 'Refresh' }}
          </button>
        </div>
        <div class="row">
          <div class="row-text">
            <div class="row-title">Clear watch history</div>
            <div class="row-sub">Removes continue-watching entries and saved positions. Favorites stay.</div>
          </div>
          <button type="button" class="btn" (click)="clearHistory()">
            <app-icon name="trash" [size]="16" /> Clear
          </button>
        </div>
      </section>

      <p class="faint version">Popcorn {{ caps()?.version || '' }}</p>
    </div>
  `,
  styles: `
    .narrow { max-width: 820px; }
    .group { margin-top: 28px; padding: 6px 0 0; }
    .group h2 { font-size: 15px; color: var(--muted); font-weight: 700; margin-bottom: 8px; }
    .row {
      display: flex; align-items: center; justify-content: space-between; gap: 20px;
      padding: 16px 0; border-bottom: 1px solid var(--line);
    }
    .row.column { flex-direction: column; align-items: stretch; gap: 12px; }
    .row-title { font-weight: 600; }
    .row-sub { color: var(--muted); font-size: 13.5px; margin-top: 2px; max-width: 60ch; }
    .switch {
      flex: 0 0 auto; width: 46px; height: 28px; border-radius: 999px; background: var(--line-strong);
      position: relative; transition: background 0.15s ease;
    }
    .switch span {
      position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
      background: var(--text); transition: transform 0.15s var(--ease);
    }
    .switch[aria-checked='true'] { background: var(--accent); }
    .switch[aria-checked='true'] span { transform: translateX(18px); background: var(--accent-ink); }
    .segmented { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--bg-raised); border: 1px solid var(--line); width: fit-content; }
    .segmented button { height: 32px; padding: 0 14px; border-radius: 999px; font-size: 13.5px; font-weight: 600; color: var(--muted); }
    .segmented button:hover { color: var(--text); }
    .segmented button.active { background: var(--surface-hover); color: var(--text); }
    .segmented button:disabled { opacity: 0.4; cursor: default; }
    .facts { margin: 0; display: grid; gap: 10px; font-size: 14px; }
    .facts div { display: grid; grid-template-columns: 160px 1fr; gap: 12px; }
    .facts dt { color: var(--muted); }
    .facts dd { margin: 0; }
    .version { margin-top: 40px; font-size: 12.5px; }
  `,
})
export class SettingsPage {
  private api = inject(ApiService);
  private library = inject(LibraryService);

  readonly s = this.library.settings;
  readonly caps = toSignal(this.api.capabilities().pipe(catchError(() => of(null))), { initialValue: null });
  readonly account = toSignal(this.api.account().pipe(catchError(() => of(null))), { initialValue: null });
  readonly busy = signal(false);
  readonly refreshed = signal(false);
  readonly fmt = dateLong;

  readonly mkvOptions: { id: Settings['mkvMode']; label: string }[] = [
    { id: 'auto', label: 'Convert only if playback fails' },
    { id: 'always', label: 'Always convert' },
    { id: 'never', label: 'Never convert' },
  ];

  set(patch: Partial<Settings>) {
    this.library.updateSettings(patch);
  }

  refresh() {
    this.busy.set(true);
    this.api.clearServerCache().subscribe({
      next: () => {
        this.busy.set(false);
        this.refreshed.set(true);
        setTimeout(() => this.refreshed.set(false), 2500);
      },
      error: () => this.busy.set(false),
    });
  }

  clearHistory() {
    if (confirm('Clear continue-watching and saved positions?')) this.library.clearHistory();
  }
}
