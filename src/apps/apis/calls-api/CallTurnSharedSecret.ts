export class CallTurnSharedSecret {
  public static readonly REJECTED_PUBLIC_SECRET =
    'Kestrel7-Quartz9-Pigeon4-Nebula8-Harbor2-Cipher6-Orbit5-Velvet3';

  public static fromEnvironment(
    configuredSecret: string | undefined,
  ): CallTurnSharedSecret {
    const normalizedSecret = configuredSecret?.trim();

    if (
      !normalizedSecret ||
      normalizedSecret === CallTurnSharedSecret.REJECTED_PUBLIC_SECRET
    ) {
      return new CallTurnSharedSecret('');
    }

    return new CallTurnSharedSecret(normalizedSecret);
  }

  private constructor(private readonly secret: string) {}

  public getValue(): string {
    return this.secret;
  }

  public isConfigured(): boolean {
    return this.secret.length > 0;
  }
}
