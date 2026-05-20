import { Enum } from '@haskou/value-objects';

export type CommunityMentionTypeValue =
  | 'everyone'
  | 'here'
  | 'identity'
  | 'role';

const mentionTypes: Record<string, CommunityMentionTypeValue> = {
  EVERYONE: 'everyone',
  HERE: 'here',
  IDENTITY: 'identity',
  ROLE: 'role',
};

export class CommunityMentionType extends Enum<CommunityMentionTypeValue> {
  public static readonly EVERYONE = new CommunityMentionType(
    mentionTypes.EVERYONE,
  );

  public static readonly HERE = new CommunityMentionType(mentionTypes.HERE);

  public static readonly IDENTITY = new CommunityMentionType(
    mentionTypes.IDENTITY,
  );

  public static readonly ROLE = new CommunityMentionType(mentionTypes.ROLE);

  public getValues(): CommunityMentionTypeValue[] {
    return Object.values(mentionTypes);
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
