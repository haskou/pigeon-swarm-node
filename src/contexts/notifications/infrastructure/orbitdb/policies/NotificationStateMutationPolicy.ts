import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import PublicMutationVerifier, {
  PublicMutationExpectation,
} from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { NotificationReplicationLimits } from '../../../domain/NotificationReplicationLimits';
import { NotificationId } from '../../../domain/value-objects/NotificationId';
import { NotificationState } from '../../../domain/value-objects/NotificationState';
import { GenuineRecordQuota } from './GenuineRecordQuota';

/**
 * The state of an invitation (read, accepted, declined) is signed by its
 * recipient, one record per state so a later record never overwrites an earlier
 * one. A resolved state is absorbing: declined is refused once accepted exists
 * and a read mark is refused once either resolution exists. Both records are
 * signed by the recipient, so a conflict is the recipient contradicting
 * themselves; every node then resolves to accepted.
 *
 * The states one recipient may have admitted are bounded by
 * `limits.maxStates`, counted over the recipient's genuine state records in id
 * order, so the verdict does not depend on arrival order. The per-minute rate
 * cap of the write path stays local.
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

  private readonly quota: GenuineRecordQuota;

  public readonly collection = 'notifications';

  public readonly scopeType = 'notification_state';

  public limits = NotificationReplicationLimits.fromEnvironment();

  public static idOf(notificationId: string, state: string): string {
    return `notification-state:${notificationId}:${state}`;
  }

  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    verifier: PublicMutationVerifier,
  ) {
    super();
    this.quota = new GenuineRecordQuota(this.collection, registry, verifier);
  }

  private exists(notificationId: string, states: string[]): Promise<boolean> {
    return this.registry
      .queryDocuments(
        this.collection,
        (document) =>
          document.scopeType === 'notification_state' &&
          document.notificationId === notificationId &&
          states.includes(document.state as string),
      )
      .then((documents) => documents.length > 0);
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
        NotificationStateMutationPolicy.idOf(
          record.notificationId as string,
          record.state as string,
        ) ||
      record.read !== true ||
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

  public async assertPermitted(
    record: Record<string, unknown>,
    authorIdentityId: string,
    isDeletion: boolean,
  ): Promise<void> {
    const notificationId = record.notificationId as string;

    if (isDeletion || record.recipientIdentityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    const [invitation] = await this.registry.queryDocuments(
      this.collection,
      (document) =>
        document.id === notificationId &&
        document.scopeType === 'notification_invitation',
    );

    if (invitation?.recipientIdentityId !== authorIdentityId) {
      throw new InvalidPublicMutationError();
    }

    const stronger: Record<string, string[]> = {
      accepted: [],
      declined: ['accepted'],
      pending: ['accepted', 'declined'],
    };

    if (await this.exists(notificationId, stronger[record.state as string])) {
      throw new InvalidPublicMutationError();
    }

    await this.quota.assertWithin(record, {
      authorField: 'recipientIdentityId',
      expectationOf: (payload) => this.expectationOf(payload),
      limit: this.limits.maxStates,
      scopeType: this.scopeType,
    });
  }
}
