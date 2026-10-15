export class IdentityPresenceWasUpdatedAttributes {
  [key: string]: unknown;

  public readonly identityId!: string;
  public readonly lastActivityAt?: number;
  public readonly lastHeartbeatAt?: number;
  public readonly preferenceUpdatedAt!: number;
  public readonly selectedStatus!: string;
  public readonly status!: string;
  public readonly updatedAt!: number;
}
