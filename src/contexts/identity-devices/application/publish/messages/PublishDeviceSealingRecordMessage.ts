export class PublishDeviceSealingRecordMessage {
  public constructor(
    public readonly identityId: string,
    public readonly deviceCredential: string,
    public readonly utcDay: string,
    public readonly sealingPublicKey: string,
    public readonly signature: string,
  ) {}
}
