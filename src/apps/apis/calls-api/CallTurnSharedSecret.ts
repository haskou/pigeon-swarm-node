export class CallTurnSharedSecret {
  public static readonly DEFAULT =
    'Kestrel7-Quartz9-Pigeon4-Nebula8-Harbor2-Cipher6-Orbit5-Velvet3';

  public static fromEnvironment(
    configuredSecret: string | undefined,
  ): CallTurnSharedSecret {
    const normalizedSecret = configuredSecret?.trim();

    return normalizedSecret
      ? new CallTurnSharedSecret(normalizedSecret, false)
      : new CallTurnSharedSecret(CallTurnSharedSecret.DEFAULT, true);
  }

  private constructor(
    private readonly secret: string,
    private readonly defaultValue: boolean,
  ) {}

  public getValue(): string {
    return this.secret;
  }

  public usesDefaultValue(): boolean {
    return this.defaultValue;
  }
}
