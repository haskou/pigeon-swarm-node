export class CallSignalAcknowledgedAttributes {
  [key: string]: unknown;

  public readonly acknowledgedAt!: number;
  public readonly callId!: string;
  public readonly networkId!: string;
  public readonly ownerNodeId!: string;
  public readonly recipientIdentityId!: string;
  public readonly senderIdentityId!: string;
  public readonly signalId!: string;
}
