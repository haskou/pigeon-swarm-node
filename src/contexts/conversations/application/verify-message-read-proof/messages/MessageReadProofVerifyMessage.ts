export class MessageReadProofVerifyMessage {
  public readonly conversationId: string;
  public readonly readerIdentityId: string;
  public readonly messageId: string;
  public readonly readProof: unknown;

  constructor(
    conversationId: string,
    readerIdentityId: string,
    messageId: string,
    readProof: unknown,
  ) {
    this.conversationId = conversationId;
    this.readerIdentityId = readerIdentityId;
    this.messageId = messageId;
    this.readProof = readProof;
  }
}
