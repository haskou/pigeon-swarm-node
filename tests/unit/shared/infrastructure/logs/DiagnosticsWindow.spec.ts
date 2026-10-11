import { DiagnosticsWindow } from '@app/shared/infrastructure/logs/DiagnosticsWindow';

const MINUTE_MS = 60_000;
const openedAt = Date.UTC(2026, 0, 1, 12, 0, 0);

describe('DiagnosticsWindow', () => {
  it('stays closed when no minutes are configured', () => {
    const window = DiagnosticsWindow.fromMinutes(0, openedAt);

    expect(window.isOpen(openedAt)).toBe(false);
  });

  it.each([-5, Number.NaN, 0.5])(
    'stays closed for the invalid value %p',
    (minutes) => {
      const window = DiagnosticsWindow.fromMinutes(minutes, openedAt);

      expect(window.isOpen(openedAt)).toBe(false);
    },
  );

  it('is open until the configured minutes have elapsed, then closes on its own', () => {
    const window = DiagnosticsWindow.fromMinutes(15, openedAt);

    expect(window.isOpen(openedAt)).toBe(true);
    expect(window.isOpen(openedAt + 15 * MINUTE_MS - 1)).toBe(true);
    expect(window.isOpen(openedAt + 15 * MINUTE_MS)).toBe(false);
  });

  it('caps the window at 60 minutes', () => {
    const window = DiagnosticsWindow.fromMinutes(10_000, openedAt);

    expect(window.isOpen(openedAt + 60 * MINUTE_MS - 1)).toBe(true);
    expect(window.isOpen(openedAt + 60 * MINUTE_MS)).toBe(false);
  });
});
