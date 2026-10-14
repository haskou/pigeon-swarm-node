import { Timestamp } from '@haskou/value-objects';

import { DiagnosticsSession } from '../../domain/DiagnosticsSession';
import DiagnosticsSessionRepository from '../../domain/repositories/DiagnosticsSessionRepository';

/**
 * Keeps the diagnostics session in process memory only, so it never reaches
 * disk and disappears on restart. A timer drops the session once its retention
 * ends, even when nobody asks for it again.
 */
export default class InMemoryDiagnosticsSessionRepository extends DiagnosticsSessionRepository {
  private session?: DiagnosticsSession;
  private discardTimer?: NodeJS.Timeout;

  private scheduleDiscard(session: DiagnosticsSession): void {
    clearTimeout(this.discardTimer);
    this.discardTimer = setTimeout(
      () => {
        this.discard();
      },
      Math.max(0, session.getDiscardsAt().valueOf() - Date.now()),
    );
    this.discardTimer.unref();
  }

  private discard(): void {
    clearTimeout(this.discardTimer);
    this.discardTimer = undefined;
    this.session = undefined;
  }

  public delete(): Promise<void> {
    this.discard();

    return Promise.resolve();
  }

  public find(): Promise<DiagnosticsSession | undefined> {
    if (this.session?.isDiscardedAt(Timestamp.now())) {
      this.discard();
    }

    return Promise.resolve(this.session);
  }

  public save(session: DiagnosticsSession): Promise<void> {
    if (session !== this.session) {
      this.session = session;
      this.scheduleDiscard(session);
    }

    return Promise.resolve();
  }
}
