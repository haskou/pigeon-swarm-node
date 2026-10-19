/**
 * Who belongs to a 1:1 conversation: the state its genesis folds into. The
 * creator is the author of the genesis and one of the two members; the roster
 * never changes once created. Group rosters live in MLS.
 */
export class ConversationRoster {
  private readonly members: readonly string[];

  constructor(
    private readonly id: string,
    private readonly networkId: string,
    private readonly creator: string,
    members: readonly string[],
  ) {
    this.members = [...members];
  }

  public getCreator(): string {
    return this.creator;
  }

  public getId(): string {
    return this.id;
  }

  public getMembers(): string[] {
    return [...this.members];
  }

  public getNetworkId(): string {
    return this.networkId;
  }

  public isMember(identityId: string): boolean {
    return this.members.includes(identityId);
  }
}
