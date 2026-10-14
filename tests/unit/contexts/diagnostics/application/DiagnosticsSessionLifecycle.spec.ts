import DiagnosticsSessionCloser from '@app/contexts/diagnostics/application/close/DiagnosticsSessionCloser';
import DiagnosticsSessionExporter from '@app/contexts/diagnostics/application/export/DiagnosticsSessionExporter';
import { DiagnosticsSessionOpenMessage } from '@app/contexts/diagnostics/application/open/messages/DiagnosticsSessionOpenMessage';
import DiagnosticsSessionOpener from '@app/contexts/diagnostics/application/open/DiagnosticsSessionOpener';
import { DiagnosticsEntryRecordMessage } from '@app/contexts/diagnostics/application/record/messages/DiagnosticsEntryRecordMessage';
import DiagnosticsEntryRecorder from '@app/contexts/diagnostics/application/record/DiagnosticsEntryRecorder';
import { DiagnosticsConsentRequiredError } from '@app/contexts/diagnostics/domain/errors/DiagnosticsConsentRequiredError';
import { DiagnosticsSessionNotFoundError } from '@app/contexts/diagnostics/domain/errors/DiagnosticsSessionNotFoundError';
import InMemoryDiagnosticsSessionRepository from '@app/contexts/diagnostics/infrastructure/memory/InMemoryDiagnosticsSessionRepository';

describe('Diagnostics session lifecycle', () => {
  const openedAt = 1_770_000_000_000;
  let repository: InMemoryDiagnosticsSessionRepository;
  let opener: DiagnosticsSessionOpener;
  let recorder: DiagnosticsEntryRecorder;
  let exporter: DiagnosticsSessionExporter;
  let closer: DiagnosticsSessionCloser;

  beforeEach(() => {
    jest.useFakeTimers({ now: openedAt });
    repository = new InMemoryDiagnosticsSessionRepository();
    opener = new DiagnosticsSessionOpener(repository);
    recorder = new DiagnosticsEntryRecorder(repository);
    exporter = new DiagnosticsSessionExporter(repository);
    closer = new DiagnosticsSessionCloser(repository);
  });

  afterEach(async () => {
    await closer.close();
    jest.useRealTimers();
  });

  it('records nothing until the owner opens a session', async () => {
    await recorder.record(new DiagnosticsEntryRecordMessage('line'));

    await expect(recorder.isRecording()).resolves.toBe(false);
    await expect(exporter.export()).rejects.toThrow(
      DiagnosticsSessionNotFoundError,
    );
  });

  it('refuses to open a session without consent', async () => {
    await expect(
      opener.open(new DiagnosticsSessionOpenMessage(10, false)),
    ).rejects.toThrow(DiagnosticsConsentRequiredError);
    await expect(recorder.isRecording()).resolves.toBe(false);
  });

  it('exports what was recorded while the consented window was open', async () => {
    await opener.open(new DiagnosticsSessionOpenMessage(5, true));
    await recorder.record(new DiagnosticsEntryRecordMessage('inside'));
    jest.advanceTimersByTime(5 * 60_000);
    await recorder.record(new DiagnosticsEntryRecordMessage('after'));

    await expect(recorder.isRecording()).resolves.toBe(false);
    expect((await exporter.export()).toPrimitives().entries).toEqual([
      'inside',
    ]);
  });

  it('discards the session on its own when retention ends', async () => {
    await opener.open(new DiagnosticsSessionOpenMessage(5, true));
    await recorder.record(new DiagnosticsEntryRecordMessage('inside'));
    jest.advanceTimersByTime(65 * 60_000);

    await expect(repository.find()).resolves.toBeUndefined();
    await expect(exporter.export()).rejects.toThrow(
      DiagnosticsSessionNotFoundError,
    );
  });

  it('discards everything when the owner ends the session', async () => {
    await opener.open(new DiagnosticsSessionOpenMessage(5, true));
    await recorder.record(new DiagnosticsEntryRecordMessage('inside'));
    await closer.close();

    await expect(recorder.isRecording()).resolves.toBe(false);
    await expect(exporter.export()).rejects.toThrow(
      DiagnosticsSessionNotFoundError,
    );
  });

  it('starts a fresh session when the owner opens it again', async () => {
    await opener.open(new DiagnosticsSessionOpenMessage(5, true));
    await recorder.record(new DiagnosticsEntryRecordMessage('first'));
    await opener.open(new DiagnosticsSessionOpenMessage(5, true));

    expect((await exporter.export()).toPrimitives().entries).toEqual([]);
  });
});
