import { Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageMentions as Mentions } from '../../CommunityChannelMessageMentions';
import { CommunityChannelMessage } from './CommunityChannelMessage';
import { CommunityChannelMessagePayload } from './CommunityChannelMessagePayload';

export class CommunityChannelMessageEdition {
  constructor(
    private readonly payload: CommunityChannelMessagePayload,
    private readonly signature: Signature,
    private readonly editedAt: Timestamp,
    private readonly mentions: Mentions,
  ) {}

  public applyTo(message: CommunityChannelMessage): CommunityChannelMessage {
    return message.edit(
      this.payload,
      this.signature,
      this.editedAt,
      this.mentions,
    );
  }

  public getMentions(): Mentions {
    return this.mentions;
  }

  public getPayload(): CommunityChannelMessagePayload {
    return this.payload;
  }
}
