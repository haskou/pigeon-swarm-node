import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Notification } from '../domain/Notification';
import NotificationRepository from '../domain/repositories/NotificationRepository';
import { NotificationId } from '../domain/value-objects/NotificationId';
import LocalNotificationRepository from './local-db/LocalNotificationRepository';
import OrbitDBNotificationRepository from './orbitdb/OrbitDBNotificationRepository';

/** Replicated signed invitations plus local derived missed calls. */
export default class NotificationRepositoryRouter extends NotificationRepository {
  constructor(
    private readonly replicated: OrbitDBNotificationRepository,
    private readonly local: LocalNotificationRepository,
  ) {
    super();
  }

  public findById(id: NotificationId): Promise<Notification | undefined> {
    return id.isMissedCall()
      ? this.local.findById(id)
      : this.replicated.findById(id);
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
    limit: number,
    beforeNotificationId?: NotificationId,
  ): Promise<Notification[]> {
    const all = [
      ...(await this.replicated.findByRecipient(
        recipientIdentityId,
        Number.MAX_SAFE_INTEGER,
      )),
      ...(await this.local.findByRecipient(recipientIdentityId)),
    ].sort((left, right) =>
      right.getId().valueOf().localeCompare(left.getId().valueOf()),
    );
    const start = beforeNotificationId
      ? all.findIndex((n) => n.getId().isEqual(beforeNotificationId)) + 1
      : 0;

    return all.slice(start, start + limit);
  }

  public saveInvitation(
    n: Notification,
    proof: PublicMutationProof,
  ): Promise<void> {
    return this.replicated.saveInvitation(n, proof);
  }

  public saveMissedCall(n: Notification): Promise<void> {
    return this.local.save(n);
  }

  public saveState(n: Notification, proof: PublicMutationProof): Promise<void> {
    return this.replicated.saveState(n, proof);
  }
}
