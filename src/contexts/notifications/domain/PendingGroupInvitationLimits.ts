/**
 * How many pending group invitation letters a node lists for one recipient:
 * per (inviter, recipient) pair, and in total. Letters beyond either bound
 * stay stored; the node only holds them back from the listing.
 */
export class PendingGroupInvitationLimits {
  public static readonly DEFAULT_PER_PAIR = 4;
  public static readonly DEFAULT_PER_RECIPIENT = 100;

  constructor(
    public readonly perPair: number,
    public readonly perRecipient: number,
  ) {}
}
