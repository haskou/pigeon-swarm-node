import DiagnosticsSessionRepository from '../../domain/repositories/DiagnosticsSessionRepository';

/**
 * Ends the diagnostics session and discards everything it recorded.
 */
export default class DiagnosticsSessionCloser {
  constructor(private readonly repository: DiagnosticsSessionRepository) {}

  public async close(): Promise<void> {
    await this.repository.delete();
  }
}
