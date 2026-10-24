import { Pipe, PipeTransform } from '@angular/core';

/** 3725 → "1:02:05", 65 → "1:05" */
export function clock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** 5400 → "1 h 30 min", 1500 → "25 min" */
export function humanDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

/** Epoch ms → "7:30 PM" in the viewer's locale */
export function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function dateLong(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** "Edge of Tomorrow" → "ET" (for image fallbacks) */
export function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

@Pipe({ name: 'clock' })
export class ClockPipe implements PipeTransform {
  transform = clock;
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform = humanDuration;
}

@Pipe({ name: 'timeOfDay' })
export class TimeOfDayPipe implements PipeTransform {
  transform = timeOfDay;
}
