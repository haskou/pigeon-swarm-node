import ConversationOperationMutationPolicy from '@app/contexts/conversations/infrastructure/orbitdb/policies/ConversationOperationMutationPolicy';
import NotificationScopeSettingsMutationPolicy from '@app/contexts/notification-settings/infrastructure/orbitdb/policies/NotificationScopeSettingsMutationPolicy';
import { PublicMutationPolicy } from '@app/contexts/public-mutations/domain/services/PublicMutationPolicy';

export default class ConversationMutationPolicies {
  constructor(
    private readonly operations: ConversationOperationMutationPolicy,
    private readonly notificationSettings: NotificationScopeSettingsMutationPolicy,
  ) {}

  public all(): PublicMutationPolicy[] {
    return [this.operations, this.notificationSettings];
  }
}
