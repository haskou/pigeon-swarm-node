import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { NotificationSettingScope } from '../../../domain/value-objects/NotificationSettingScope';
import { NotificationSettingScopeType } from '../../../domain/value-objects/NotificationSettingScopeType';

export class NotificationScopeSettingsResetMessage {
  constructor(
    private readonly identityId: string,
    private readonly scope: {
      channelId?: string;
      communityId?: string;
      conversationId?: string;
      type: string;
    },
    private readonly mutation: unknown,
  ) {}

  private scopeType(): NotificationSettingScopeType {
    return new NotificationSettingScopeType(this.scope.type);
  }

  public getIdentityId(): IdentityId {
    return new IdentityId(this.identityId);
  }

  public getProof(): PublicMutationProof {
    return PublicMutationProof.fromPrimitives(this.mutation);
  }

  public getScope(): NotificationSettingScope {
    const type = this.scopeType();

    if (type.isConversation()) {
      return NotificationSettingScope.conversation(
        new ConversationId(this.scope.conversationId || ''),
      );
    }

    if (type.isCommunityChannel()) {
      return NotificationSettingScope.communityChannel(
        new CommunityId(this.scope.communityId || ''),
        new CommunityChannelId(this.scope.channelId || ''),
      );
    }

    return NotificationSettingScope.community(
      new CommunityId(this.scope.communityId || ''),
    );
  }
}
