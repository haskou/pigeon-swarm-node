export class KeychainSignaturePayload {
  public static fromPrimitives(primitives: {
    encryptedPayload: string;
    ownerIdentityId: string;
    previousKeychainExternalIdentifier?: string;
    timestamp: number;
    version: number;
  }): KeychainSignaturePayload {
    return new KeychainSignaturePayload(primitives);
  }

  private constructor(
    private readonly primitives: {
      encryptedPayload: string;
      ownerIdentityId: string;
      previousKeychainExternalIdentifier?: string;
      timestamp: number;
      version: number;
    },
  ) {}

  public toPrimitives(): {
    encryptedPayload: string;
    ownerIdentityId: string;
    previousKeychainExternalIdentifier?: string;
    timestamp: number;
    version: number;
  } {
    return {
      encryptedPayload: this.primitives.encryptedPayload,
      ownerIdentityId: this.primitives.ownerIdentityId,
      previousKeychainExternalIdentifier:
        this.primitives.previousKeychainExternalIdentifier,
      timestamp: this.primitives.timestamp,
      version: this.primitives.version,
    };
  }
}
