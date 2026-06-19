import { Enum } from '@haskou/value-objects';

const communityMentionTypes = {
  EVERYONE: 'everyone',
  HERE: 'here',
  IDENTITY: 'identity',
  ROLE: 'role',
} as const;

export class CommunityMentionType extends Enum<string> {
  public static readonly EVERYONE = new CommunityMentionType(
    communityMentionTypes.EVERYONE,
  );

  public static readonly HERE = new CommunityMentionType(
    communityMentionTypes.HERE,
  );

  public static readonly IDENTITY = new CommunityMentionType(
    communityMentionTypes.IDENTITY,
  );

  public static readonly ROLE = new CommunityMentionType(
    communityMentionTypes.ROLE,
  );

  public getValues(): string[] {
    return Object.values(communityMentionTypes);
  }

  public isEveryone(): boolean {
    return this.isEqual(CommunityMentionType.EVERYONE);
  }

  public isHere(): boolean {
    return this.isEqual(CommunityMentionType.HERE);
  }

  public isRole(): boolean {
    return this.isEqual(CommunityMentionType.ROLE);
  }
}
