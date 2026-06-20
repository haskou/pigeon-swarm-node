import { CommunityChannelMessagePin } from '../../domain/CommunityChannelMessagePin';
import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';

export class CommunityChannelMessagePinDetails {
  constructor(
    private readonly pin: CommunityChannelMessagePin,
    private readonly message: CommunityChannelMessage,
  ) {}

  public getMessage(): CommunityChannelMessage {
    return this.message;
  }

  public getPin(): CommunityChannelMessagePin {
    return this.pin;
  }
}
