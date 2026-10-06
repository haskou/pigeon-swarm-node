import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';

/**
 * Admits a `notification:<recordId>` head only when it is the admitted signed
 * invitation or state record of that very id. The recipient index head is not
 * replicated any more: it is rebuilt locally, so any such head is refused.
 */
export class OrbitDBNotificationHeadMutationGate extends OrbitDBMutationGate {
  public static readonly COLLECTION = 'notifications';
  public static readonly HEAD_PREFIX = 'notification:';
  public static readonly RECIPIENT_INDEX_HEAD_PREFIX =
    'notification-recipient-index:';

  constructor(private readonly publicGate: PublicMutationGate) {
    super();
  }

  public governs(): boolean {
    return false;
  }

  public accepts(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public governsHead(key: string): boolean {
    return (
      key.startsWith(OrbitDBNotificationHeadMutationGate.HEAD_PREFIX) ||
      key.startsWith(
        OrbitDBNotificationHeadMutationGate.RECIPIENT_INDEX_HEAD_PREFIX,
      )
    );
  }

  public async acceptsHead(
    key: string,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.governsHead(key)) return true;

    return (
      key ===
        `${OrbitDBNotificationHeadMutationGate.HEAD_PREFIX}${String(record.id)}` &&
      (await this.publicGate.accepts(
        OrbitDBNotificationHeadMutationGate.COLLECTION,
        record,
      ))
    );
  }
}
