import { CommunityChannelMessageMention as Mention } from './entities/messages/CommunityChannelMessageMention';

export class CommunityChannelMessageMentions {
  public static empty(): CommunityChannelMessageMentions {
    return new CommunityChannelMessageMentions([]);
  }

  public static from(mentions: Mention[]): CommunityChannelMessageMentions {
    return new CommunityChannelMessageMentions(mentions);
  }

  private constructor(private readonly mentions: Mention[]) {}

  public [Symbol.iterator](): Iterator<Mention> {
    return this.mentions[Symbol.iterator]();
  }

  public toArray(): Mention[] {
    return [...this.mentions];
  }

  public toPrimitives() {
    return this.mentions.map((mention) => mention.toPrimitives());
  }
}
