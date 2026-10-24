import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { initials } from '../core/format';

/**
 * An image with a graceful fallback: while loading it shows a quiet surface,
 * on error it shows the title's initials. `fit` controls object-fit.
 */
@Component({
  selector: 'app-artwork',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.loaded]': 'loaded()', '[class.failed]': 'failed()', '[class.contain]': 'fit() === "contain"' },
  template: `
    @if (src() && !failed()) {
      <img [src]="src()" [alt]="alt()" loading="lazy" decoding="async"
        (load)="loaded.set(true)" (error)="failed.set(true)" />
    }
    @if (!src() || failed()) {
      <span class="fallback" aria-hidden="true">{{ mark() }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      overflow: hidden;
      background: var(--surface);
      width: 100%;
      height: 100%;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    :host.contain img { object-fit: contain; padding: 12%; }
    :host.loaded img { opacity: 1; }
    .fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: clamp(16px, 22cqw, 40px);
      letter-spacing: -0.04em;
      color: var(--faint);
      container-type: inline-size;
    }
  `,
})
export class Artwork {
  readonly src = input<string | null | undefined>(null);
  readonly alt = input<string>('');
  readonly fit = input<'cover' | 'contain'>('cover');
  readonly loaded = signal(false);
  readonly failed = signal(false);
  readonly mark = computed(() => initials(this.alt()));
}
