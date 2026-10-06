import ConversationMessageMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageMutationPolicy';
import ConversationMessagePinMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessagePinMutationPolicy';
import ConversationMessageReactionMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationMessageReactionMutationPolicy';
import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import NotificationScopeSettingsMutationPolicy from '@app/contexts/notification-settings/infrastructure/orbitdb/policies/NotificationScopeSettingsMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class ConversationMutationPolicies {
  constructor(
    private readonly operations: ConversationOperationMutationPolicy,
    private readonly messages: ConversationMessageMutationPolicy,
    private readonly pins: ConversationMessagePinMutationPolicy,
    private readonly reactions: ConversationMessageReactionMutationPolicy,
    private readonly notificationSettings: NotificationScopeSettingsMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [
      this.operations,
      this.messages,
      this.pins,
      this.reactions,
      this.notificationSettings,
    ];
  }
}
