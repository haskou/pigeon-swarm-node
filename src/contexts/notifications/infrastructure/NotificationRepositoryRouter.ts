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

  public hasById(id: NotificationId): Promise<boolean> {
    return id.isMissedCall()
      ? this.local.hasById(id)
      : this.replicated.hasById(id);
  }

  public requireById(id: NotificationId): Promise<Notification> {
    return id.isMissedCall()
      ? this.local.requireById(id)
      : this.replicated.requireById(id);
  }

  public async findByRecipient(
    recipientIdentityId: IdentityId,
  ): Promise<Notification[]> {
    return [
      ...(await this.replicated.findByRecipient(recipientIdentityId)),
      ...(await this.local.findByRecipient(recipientIdentityId)),
    ];
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
