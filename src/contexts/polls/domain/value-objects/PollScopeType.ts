import { Enum } from '@haskou/value-objects';

export type PollScopeTypeValue = 'community_channel' | 'group_conversation';

export class PollScopeType extends Enum<PollScopeTypeValue> {
  public static readonly COMMUNITY_CHANNEL = new PollScopeType(
    'community_channel',
  );

  public static readonly GROUP_CONVERSATION = new PollScopeType(
    'group_conversation',
  );

  public getValues(): PollScopeTypeValue[] {
    return ['community_channel', 'group_conversation'];
  }

  public isCommunityChannel(): boolean {
    return this.isEqual(PollScopeType.COMMUNITY_CHANNEL);
  }

  public isGroupConversation(): boolean {
    return this.isEqual(PollScopeType.GROUP_CONVERSATION);
  }
}
