import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { AsyncLocalStorage } from 'node:async_hooks';

import { NotificationState } from '../../../domain/value-objects/NotificationState';
import { NotificationId } from '../../../domain/value-objects/NotificationId';

/**
 * The state of an invitation (accepted, declined, read) is signed by its
 * recipient. A resolved state is absorbing and `read` never goes back to false.
 */
export default class NotificationStateMutationPolicy extends PublicMutationPolicy {
  private static readonly STATES = new NotificationState(
    NotificationState.PENDING.valueOf(),
  ).getValues();

  private readonly shape = new PublicMutationRecordShape(
    ['id', 'notificationId', 'recipientIdentityId', 'state'],
    [],
    'notification_state',
    { booleans: ['read'] },
  );

  /** Re-entrancy guard: admitting the stored predecessor must not look for its own predecessor. */
  private readonly checking = new AsyncLocalStorage<Set<string>>();

  public readonly collection = 'notifications';

  public readonly scopeType = 'notification_state';

  constructor(private readonly registry: OrbitDBReplicatedStateRegistry) {
    super();
  }

  public static idOf(notificationId: string): string {
    return `notification-state:${notificationId}`;
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    if (
      record.removed !== undefined ||
      !NotificationStateMutationPolicy.STATES.includes(
        record.state as string,
      ) ||
      record.id !==
        NotificationStateMutationPolicy.idOf(record.notificationId as string) ||
      !(record.notificationId as string).startsWith(
        NotificationId.INVITATION_PREFIX,
      )
    ) {
      throw new InvalidPublicMutationError();
    }

    try {
      new IdentityId(record.recipientIdentityId as string);
    } catch {
      throw new InvalidPublicMutationError();
    }

    return {
      authorIdentityId: record.recipientIdentityId as string,
      recordId: record.id as string,
      store: this.collection,
    };
  }

  private find(
    id: string,
    scopeType: string,
  ): Promise<Record<string, unknown> | undefined> {
    return this.registry
      .queryDocuments(
        this.collection,
        (document) => document.id === id && document.scopeType === scopeType,
      )
      .then(([document]) => document);
  }

  private assertAbsorbing(
    record: Record<string, unknown>,
    previous: Record<string, unknown> | undefined,
  ): void {
    if (!previous) return;

    const resolved = previous.state !== NotificationState.PENDING.valueOf();

    if (
      (resolved && record.state !== previous.state) ||
      (previous.read === true && record.read !== true)
    ) {
      throw new InvalidPublicMutationError();
    }
  }

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    const notificationId = record.notificationId as string;
    const active = this.checking.getStore();

    if (isDeletion || record.recipientIdentityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    const invitation = await this.find(
      notificationId,
      'notification_invitation',
    );

    if (invitation?.recipientIdentityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    if (active?.has(notificationId)) return;

    const guard = new Set(active).add(notificationId);
    const previous = await this.checking.run(guard, () =>
      this.find(record.id as string, 'notification_state'),
    );

    this.assertAbsorbing(record, previous);
  }
}
