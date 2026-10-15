import { Integer, Timestamp } from '@haskou/value-objects';

export class NodeRegistrationCodeIssuerMessage {
  private static readonly DEFAULT_MAX_USES = 1;

  public readonly expiresAt: Timestamp;
  public readonly maxUses: Integer;

  constructor(expiresAt: number, maxUses?: number) {
    this.expiresAt = new Timestamp(expiresAt);
    this.maxUses = new Integer(
      maxUses ?? NodeRegistrationCodeIssuerMessage.DEFAULT_MAX_USES,
    );
  }
}
