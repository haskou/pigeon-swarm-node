import { OrbitDBNotificationHeadMutationGate } from '@app/contexts/notifications/infrastructure/orbitdb/OrbitDBNotificationHeadMutationGate';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import { PublicMutationGate } from '@app/contexts/public-mutations/infrastructure/PublicMutationGate';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';

import CallMutationPolicies from './CallMutationPolicies';
import CommunityMutationPolicies from './CommunityMutationPolicies';
import ContentMutationPolicies from './ContentMutationPolicies';
import ConversationMutationPolicies from './ConversationMutationPolicies';
import NotificationMutationPolicies from './NotificationMutationPolicies';

export default class PublicMutationGateInitializer {
  constructor(
    private readonly registry: OrbitDBReplicatedStateRegistry,
    private readonly verifier: PublicMutationVerifier,
    private readonly communities: CommunityMutationPolicies,
    private readonly conversations: ConversationMutationPolicies,
    private readonly content: ContentMutationPolicies,
    private readonly notifications: NotificationMutationPolicies,
    private readonly calls: CallMutationPolicies,
  ) {}

  public ensure(): Promise<void> {
    const gate = new PublicMutationGate(this.verifier, [
      ...this.communities.all(),
      ...this.conversations.all(),
      ...this.content.all(),
      ...this.notifications.all(),
      ...this.calls.all(),
    ]);

    this.registry.addMutationGate(gate);
    this.registry.addMutationGate(
      new OrbitDBNotificationHeadMutationGate(gate),
    );

    return Promise.resolve();
  }
}
