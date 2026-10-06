import NotificationInvitationMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationInvitationMutationPolicy';
import NotificationStateMutationPolicy from '@app/contexts/notifications/infrastructure/orbitdb/policies/NotificationStateMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class NotificationMutationPolicies {
  constructor(
    private readonly invitations: NotificationInvitationMutationPolicy,
    private readonly states: NotificationStateMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.invitations, this.states];
  }
}
