import { Enum } from '@haskou/value-objects';

enum PollScopeTypePrimitive {
  COMMUNITY_CHANNEL = 'community_channel',
  GROUP_CONVERSATION = 'group_conversation',
}

const pollScopeTypes = {
  COMMUNITY_CHANNEL: 'community_channel',
  GROUP_CONVERSATION: 'group_conversation',
} as const;

export class PollScopeType extends Enum<string> {
  public static readonly COMMUNITY_CHANNEL = new PollScopeType(
    PollScopeTypePrimitive.COMMUNITY_CHANNEL,
  );

  public static readonly GROUP_CONVERSATION = new PollScopeType(
    PollScopeTypePrimitive.GROUP_CONVERSATION,
  );

  public getValues(): string[] {
    return Object.values(pollScopeTypes);
  }

  public isCommunityChannel(): boolean {
    return this.isEqual(PollScopeType.COMMUNITY_CHANNEL);
  }

  public isGroupConversation(): boolean {
    return this.isEqual(PollScopeType.GROUP_CONVERSATION);
  }
}
