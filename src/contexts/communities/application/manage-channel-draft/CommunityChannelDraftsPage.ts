import { CommunityChannelDraft } from '../../domain/CommunityChannelDraft';

/** One page of an identity's drafts, most recently updated first, with the position to read after. */
export class CommunityChannelDraftsPage {
  constructor(
    private readonly items: CommunityChannelDraft[],
    private readonly nextPosition: string | undefined,
  ) {}

  public getItems(): CommunityChannelDraft[] {
    return [...this.items];
  }

  /** The position to read after next, set only when the page is full. */
  public getNextPosition(): string | undefined {
    return this.nextPosition;
  }
}
