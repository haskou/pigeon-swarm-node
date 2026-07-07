import { Enum } from '@haskou/value-objects';

const communityChannelTypes = {
  TEXT: 'text',
  VOICE: 'voice',
} as const;

export class CommunityChannelType extends Enum<string> {
  public static readonly TEXT = new CommunityChannelType(
    communityChannelTypes.TEXT,
  );

  public static readonly VOICE = new CommunityChannelType(
    communityChannelTypes.VOICE,
  );

  public static textPrimitive(): typeof communityChannelTypes.TEXT {
    return communityChannelTypes.TEXT;
  }

  public static voicePrimitive(): typeof communityChannelTypes.VOICE {
    return communityChannelTypes.VOICE;
  }

  public getValues(): string[] {
    return Object.values(communityChannelTypes);
  }

  public isText(): boolean {
    return this.isEqual(CommunityChannelType.TEXT);
  }

  public isVoice(): boolean {
    return this.isEqual(CommunityChannelType.VOICE);
  }

  public toPrimitives(): 'text' | 'voice' {
    if (this.isText()) {
      return communityChannelTypes.TEXT;
    }

    return communityChannelTypes.VOICE;
  }
}
