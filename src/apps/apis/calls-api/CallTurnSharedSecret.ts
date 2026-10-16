import { InvalidCallTurnSharedSecretError } from './errors/InvalidCallTurnSharedSecretError';

export class CallTurnSharedSecret {
  private static readonly LONE_SURROGATE =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  public static readonly MAX_LENGTH = 4096;

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

    if (
      normalizedSecret.length > CallTurnSharedSecret.MAX_LENGTH ||
      CallTurnSharedSecret.LONE_SURROGATE.test(normalizedSecret)
    ) {
      throw new InvalidCallTurnSharedSecretError(
        CallTurnSharedSecret.MAX_LENGTH,
      );
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
