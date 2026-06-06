import { Enum } from '@haskou/value-objects';

import { pollScopeTypes } from './types/PollScopeTypes';
import { PollScopeTypeValue } from './types/PollScopeTypeValue';

export { PollScopeTypeValue } from './types/PollScopeTypeValue';

export class PollScopeType extends Enum<PollScopeTypeValue> {
  public static readonly COMMUNITY_CHANNEL = new PollScopeType(
    pollScopeTypes.COMMUNITY_CHANNEL,
  );

  public static readonly GROUP_CONVERSATION = new PollScopeType(
    pollScopeTypes.GROUP_CONVERSATION,
  );

  public getValues(): PollScopeTypeValue[] {
    return Object.values(pollScopeTypes);
  }

  public isCommunityChannel(): boolean {
    return this.isEqual(PollScopeType.COMMUNITY_CHANNEL);
  }

  public isGroupConversation(): boolean {
    return this.isEqual(PollScopeType.GROUP_CONVERSATION);
  }
}
