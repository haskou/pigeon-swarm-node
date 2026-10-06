import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { PublicMutationRecord } from '@app/contexts/public-mutations/domain/PublicMutationRecord';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import { Notification } from '../../domain/Notification';
import NotificationRepository from '../../domain/repositories/NotificationRepository';
import { NotificationId } from '../../domain/value-objects/NotificationId';
import { OrbitDBNotificationInvitationDocument } from './documents/OrbitDBNotificationInvitationDocument';
import { OrbitDBNotificationStateDocument } from './documents/OrbitDBNotificationStateDocument';
import OrbitDBNotificationMapper from './mappers/OrbitDBNotificationMapper';

/**
 * Replicated notifications: inviter-signed invitation records and
 * recipient-signed state records. The per-recipient list is never replicated;
 * it is rebuilt from the admitted records of the store.
 */
export default class OrbitDBNotificationRepository extends NotificationRepository {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly mapper: OrbitDBNotificationMapper,
  ) {
    super();
  }

  private headKey(recordId: string): string {
    return `notification:${recordId}`;
  }

  private async query(
    scopeType: string,
    matches: (document: Record<string, unknown>) => boolean,
  ): Promise<Record<string, unknown>[]> {
    return this.registry.queryDocuments(
      'notifications',
      (document) => document.scopeType === scopeType && matches(document),
    );
  }

  private payloadOf<T>(document: Record<string, unknown>): T {
    return PublicMutationRecord.payloadOf(document) as T;
  }

  private async stateOf(
    notificationId: string,
  ): Promise<OrbitDBNotificationStateDocument | undefined> {
    const [state] = await this.query(
      'notification_state',
      (document) =>
        document.id === OrbitDBNotificationMapper.stateId(notificationId),
    );

    return state ? this.payloadOf(state) : undefined;
  }

  private async write(
    payload: Record<string, unknown> & { id: string },
    proof: PublicMutationProof,
  ): Promise<void> {
    const document = PublicMutationRecord.withProof(payload, proof);

    PublicMutationRecord.assertNotStale(
      await this.query(
        payload.scopeType as string,
        (stored) => stored.id === payload.id,
      ),
      document,
    );
    await this.registry.putDocument('notifications', document);
    this.registry.replicateHeadInBackground(this.headKey(payload.id), {
      ...document,
    });
  }

  private order(notifications: Notification[]): Notification[] {
    return notifications.sort((left, right) =>
      right.getId().valueOf().localeCompare(left.getId().valueOf()),
    );
  }

  public async findById(
    notificationId: NotificationId,
  ): Promise<Notification | undefined> {
    const [invitation] = await this.query(
      'notification_invitation',
      (document) => document.id === notificationId.valueOf(),
    );

    if (!invitation) return undefined;

    return this.mapper.toDomain(
      this.payloadOf<OrbitDBNotificationInvitationDocument>(invitation),
      await this.stateOf(notificationId.valueOf()),
    );
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]> {
    const recipient = recipientIdentityId.valueOf();
    const matches = (document: Record<string, unknown>): boolean =>
      document.recipientIdentityId === recipient;
    const invitations = await this.query('notification_invitation', matches);
    const states = new Map(
      (await this.query('notification_state', matches)).map((record) => {
        const state = this.payloadOf<OrbitDBNotificationStateDocument>(record);

        return [state.notificationId, state];
      }),
    );
    const ordered = this.order(
      invitations.map((record) => {
        const invitation =
          this.payloadOf<OrbitDBNotificationInvitationDocument>(record);

        return this.mapper.toDomain(invitation, states.get(invitation.id));
      }),
    );
    const start = beforeNotificationId
      ? ordered.findIndex((notification) =>
          notification.getId().isEqual(beforeNotificationId),
        ) + 1
      : 0;

    return ordered.slice(start, start + limit);
  }

  public async saveInvitation(
    notification: Notification,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(this.mapper.toInvitationDocument(notification), proof);
  }

  public saveMissedCall(): Promise<void> {
    return Promise.reject(
      new Error('Missed calls are local and are never replicated.'),
    );
  }

  public async saveState(
    notification: Notification,
    proof: PublicMutationProof,
  ): Promise<void> {
    await this.write(this.mapper.toStateDocument(notification), proof);
  }
}
