export class IdentityPresenceWasUpdatedAttributes {
  [key: string]: unknown;

  public readonly customMessage?: string;
  public readonly identityId?: string;
  public readonly lastActivityAt?: number;
  public readonly lastHeartbeatAt?: number;
  public readonly networkIds?: string[];
  public readonly status?: string;
  public readonly updatedAt?: number;
}
