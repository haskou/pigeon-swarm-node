import { DiagnosticsSession } from '../DiagnosticsSession';

/**
 * Holds at most one diagnostics session per node.
 */
export default abstract class DiagnosticsSessionRepository {
  public abstract delete(): Promise<void>;

  public abstract find(): Promise<DiagnosticsSession | undefined>;

  public abstract save(session: DiagnosticsSession): Promise<void>;
}
