import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecordShape } from '@app/contexts/public-mutations/domain/PublicMutationRecordShape';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';
import { PublicMutationExpectation } from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationSettingScope } from '../../../domain/value-objects/NotificationSettingScope';

/** A notification setting is the private preference of its own identity, published to its devices. */
export default class NotificationScopeSettingsMutationPolicy extends PublicMutationPolicy {
  private readonly shape = new PublicMutationRecordShape(
    ['id', 'identityId', 'scopeKey'],
    ['updatedAt'],
    'notification_settings',
    {
      booleans: [
        'hideMutedChannels',
        'mobilePushEnabled',
        'suppressEveryoneAndHere',
        'suppressRoleMentions',
      ],
      objects: ['scope'],
      optionalIntegers: ['mutedUntil'],
      putStrings: ['notificationLevel'],
    },
  );

  public readonly collection = 'notificationSettings';

  public readonly scopeType = 'notification_settings';

  private assertScope(record: Record<string, unknown>): string {
    if (record.removed === true) return record.scopeKey as string;

    const scope = NotificationSettingScope.fromPrimitives(
      record.scope as ReturnType<NotificationSettingScope['toPrimitives']>,
    );

    if (
      record.scopeKey !== scope.key() ||
      PublicMutationProof.digestOf(scope.toPrimitives()) !==
        PublicMutationProof.digestOf(record.scope as Record<string, unknown>)
    ) {
      throw new InvalidPublicMutationError();
    }

    return scope.key();
  }

  public expectationOf(
    record: Record<string, unknown>,
  ): Omit<PublicMutationExpectation, 'payload'> {
    this.shape.assert(record);

    const identityId = new IdentityId(record.identityId as string);
    const scopeKey = this.assertScope(record);
    const id = `${identityId.valueOf()}:${scopeKey}`;

    if (record.id !== id) throw new InvalidPublicMutationError();

    return {
      authorIdentityId: identityId.valueOf(),
      recordId: id,
      store: this.collection,
    };
  }

  public assertPermitted(): Promise<void> {
    return Promise.resolve();
  }
}
