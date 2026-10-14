import { Timestamp } from '@haskou/value-objects';

import { DiagnosticsSession } from '../../domain/DiagnosticsSession';
import DiagnosticsSessionRepository from '../../domain/repositories/DiagnosticsSessionRepository';
import { DiagnosticsSessionOpenMessage } from './messages/DiagnosticsSessionOpenMessage';

/**
 * Opens a fresh diagnostics session, discarding any previous one.
 */
export default class DiagnosticsSessionOpener {
  constructor(private readonly repository: DiagnosticsSessionRepository) {}

  public async open(
    message: DiagnosticsSessionOpenMessage,
  ): Promise<DiagnosticsSession> {
    const session = DiagnosticsSession.open(
      message.getDuration(),
      message.getConsent(),
      Timestamp.now(),
    );

    await this.repository.save(session);

    return session;
  }
}
