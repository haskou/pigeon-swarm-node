export class CallSignalSentAttributes {
  [key: string]: unknown;

  public readonly attempt!: number;
  public readonly callId!: string;
  public readonly expiresAt!: number;
  public readonly networkId!: string;
  public readonly ownerNodeId!: string;
  public readonly participantIds!: string[];
  public readonly payload!: unknown;
  public readonly recipientIdentityId!: string;
  public readonly senderIdentityId!: string;
  public readonly sentAt!: number;
  public readonly signalId!: string;
  public readonly signalType!: string;
}
