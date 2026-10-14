import { Enum } from '@haskou/value-objects';

enum PollScopeTypePrimitive {
  COMMUNITY_CHANNEL = 'community_channel',
}

const pollScopeTypes = {
  COMMUNITY_CHANNEL: 'community_channel',
} as const;

export class PollScopeType extends Enum<string> {
  public static readonly COMMUNITY_CHANNEL = new PollScopeType(
    PollScopeTypePrimitive.COMMUNITY_CHANNEL,
  );

  public getValues(): string[] {
    return Object.values(pollScopeTypes);
  }
}
