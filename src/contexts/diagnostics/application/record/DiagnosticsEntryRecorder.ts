import { Timestamp } from '@haskou/value-objects';

import DiagnosticsSessionRepository from '../../domain/repositories/DiagnosticsSessionRepository';
import { DiagnosticsEntryRecordMessage } from './messages/DiagnosticsEntryRecordMessage';

/**
 * Appends redacted entries to the diagnostics session while it records and
 * drops them otherwise.
 */
export default class DiagnosticsEntryRecorder {
  constructor(private readonly repository: DiagnosticsSessionRepository) {}

  public async isRecording(): Promise<boolean> {
    const session = await this.repository.find();

    return session?.isRecordingAt(Timestamp.now()) ?? false;
  }

  public async record(message: DiagnosticsEntryRecordMessage): Promise<void> {
    const session = await this.repository.find();

    if (!session) {
      return;
    }

    session.append(message.getEntry(), Timestamp.now());
    await this.repository.save(session);
  }
}
