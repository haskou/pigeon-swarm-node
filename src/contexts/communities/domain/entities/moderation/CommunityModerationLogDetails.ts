export class CommunityModerationLogDetails {
  constructor(private readonly values: Record<string, unknown>) {}

  public toPrimitives(): Record<string, unknown> {
    return this.values;
  }
}
