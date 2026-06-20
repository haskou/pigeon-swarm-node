import { CommunityModerationLogEntry } from '../../domain/entities/moderation/CommunityModerationLogEntry';

export class CommunityModerationLogsPage {
  constructor(
    private readonly logs: CommunityModerationLogEntry[],
    private readonly limit: number,
  ) {}

  public getLogs(): CommunityModerationLogEntry[] {
    return [...this.logs];
  }

  public getNextBeforeLogId(): string | undefined {
    return this.logs.length === this.limit
      ? this.logs[this.logs.length - 1].getId().valueOf()
      : undefined;
  }
}
