import { CommunityChannelMessagePinDetails } from './CommunityChannelMessagePinDetails';

/** One page of a channel's pins, newest first, with the position to read after. */
export class CommunityChannelMessagePinsPage {
  constructor(
    private readonly items: CommunityChannelMessagePinDetails[],
    private readonly nextPosition: string | undefined,
  ) {}

  public getItems(): CommunityChannelMessagePinDetails[] {
    return [...this.items];
  }

  /** The position to read after next, set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.nextPosition;
  }
}
