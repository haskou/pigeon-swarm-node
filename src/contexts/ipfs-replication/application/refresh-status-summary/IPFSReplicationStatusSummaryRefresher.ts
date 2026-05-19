import IPFSReplicationStatusFinder from '../find-status/IPFSReplicationStatusFinder';
import IPFSReplicationStatusSummaryUpdater from '../update-status-summary/IPFSReplicationStatusSummaryUpdater';

export default class IPFSReplicationStatusSummaryRefresher {
  constructor(
    private readonly finder: IPFSReplicationStatusFinder,
    private readonly updater: IPFSReplicationStatusSummaryUpdater,
  ) {}

  public async refresh(): Promise<void> {
    await this.updater.updateFromStatus(await this.finder.find());
  }
}
