import { DiagnosticsSession } from '../../domain/DiagnosticsSession';
import { DiagnosticsSessionNotFoundError } from '../../domain/errors/DiagnosticsSessionNotFoundError';
import DiagnosticsSessionRepository from '../../domain/repositories/DiagnosticsSessionRepository';

export default class DiagnosticsSessionExporter {
  constructor(private readonly repository: DiagnosticsSessionRepository) {}

  public async export(): Promise<DiagnosticsSession> {
    const session = await this.repository.find();

    if (!session) {
      throw new DiagnosticsSessionNotFoundError();
    }

    return session;
  }
}
