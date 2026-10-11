import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

export const MAX_DIAGNOSTICS_WINDOW_MINUTES = 60;

const MINUTE_MS = 60_000;

/**
 * Time-limited opt-in for diagnostic logs (DIAGNOSTICS_WINDOW_MINUTES).
 * Closed unless the operator sets a positive value. The window starts when the
 * process starts and closes on its own; reopening it requires a restart.
 */
export class DiagnosticsWindow {
  private static processWindow?: DiagnosticsWindow;

  private constructor(private readonly closesAtMs?: number) {}

  public static fromMinutes(
    minutes: number,
    openedAtMs: number,
  ): DiagnosticsWindow {
    const boundedMinutes = Math.min(
      Math.floor(minutes),
      MAX_DIAGNOSTICS_WINDOW_MINUTES,
    );

    if (!Number.isFinite(boundedMinutes) || boundedMinutes < 1) {
      return new DiagnosticsWindow();
    }

    return new DiagnosticsWindow(openedAtMs + boundedMinutes * MINUTE_MS);
  }

  public static forProcess(): DiagnosticsWindow {
    DiagnosticsWindow.processWindow ??= DiagnosticsWindow.fromMinutes(
      pigeonEnvironment().DIAGNOSTICS_WINDOW_MINUTES,
      Date.now() - process.uptime() * 1000,
    );

    return DiagnosticsWindow.processWindow;
  }

  public isOpen(nowMs: number = Date.now()): boolean {
    return this.closesAtMs !== undefined && nowMs < this.closesAtMs;
  }
}
