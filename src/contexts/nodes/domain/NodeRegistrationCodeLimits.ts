/**
 * Bounds the owner can choose for a registration code: how many identities one
 * code may create and how far ahead it may expire.
 */
export class NodeRegistrationCodeLimits {
  public static readonly DEFAULT_MAX_USES = 100;
  public static readonly DEFAULT_MAX_TTL_DAYS = 30;

  constructor(
    public readonly maxUses: number,
    public readonly maxTtlDays: number,
  ) {}
}
