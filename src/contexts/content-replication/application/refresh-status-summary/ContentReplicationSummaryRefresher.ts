import ContentReplicationStatusFinder from '../find-status/ContentReplicationStatusFinder';
import ContentReplicationStatusSummaryUpdater from '../update-status-summary/ContentReplicationStatusSummaryUpdater';

export default class ContentReplicationSummaryRefresher {
  constructor(
    private readonly finder: ContentReplicationStatusFinder,
    private readonly updater: ContentReplicationStatusSummaryUpdater,
  ) {}

  public async refresh(): Promise<void> {
    await this.updater.updateFromStatus(await this.finder.find());
  }
}
