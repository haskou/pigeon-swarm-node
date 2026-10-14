import DiagnosticsEntryRecorder from '@app/contexts/diagnostics/application/record/DiagnosticsEntryRecorder';
import { DiagnosticsEntryRecordMessage } from '@app/contexts/diagnostics/application/record/messages/DiagnosticsEntryRecordMessage';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';

/**
 * Routes redacted content retrieval diagnostics into the owner's consented
 * diagnostics session instead of the log.
 */
export default class DiagnosticsTraceInitializer {
  constructor(private readonly recorder: DiagnosticsEntryRecorder) {}

  public ensure(): Promise<void> {
    HeliaIPFS.traceDiagnosticsTo({
      isRecording: () => this.recorder.isRecording(),
      record: (line) =>
        this.recorder.record(new DiagnosticsEntryRecordMessage(line)),
    });

    return Promise.resolve();
  }
}
