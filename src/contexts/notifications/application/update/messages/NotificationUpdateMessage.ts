import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationId } from '../../../domain/value-objects/NotificationId';
import { NotificationState } from '../../../domain/value-objects/NotificationState';

export class NotificationUpdateMessage {
  public readonly notificationId: NotificationId;
  public readonly recipientIdentityId: IdentityId;
  public readonly state: NotificationState;

  constructor(
    notificationId: string,
    recipientIdentityId: string,
    state: string,
    private readonly mutation: Record<string, unknown>,
  ) {
    this.notificationId = new NotificationId(notificationId);
    this.recipientIdentityId = new IdentityId(recipientIdentityId);
    this.state = new NotificationState(state);
  }

  public getProof(): PublicMutationProof {
    return PublicMutationProof.fromPrimitives(this.mutation);
  }
}
