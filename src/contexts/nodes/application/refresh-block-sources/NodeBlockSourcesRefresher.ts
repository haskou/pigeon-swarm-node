import { Timestamp } from '@haskou/value-objects';

import { NodeBlockSourceFetchFailedError } from '../../domain/errors/NodeBlockSourceFetchFailedError';
import { NodeBlockList } from '../../domain/NodeBlockList';
import { NodeBlockSource } from '../../domain/NodeBlockSource';
import { NodeBlockSourceFetchLimits } from '../../domain/NodeBlockSourceFetchLimits';
import NodeBlockSourceRepository from '../../domain/repositories/NodeBlockSourceRepository';
import NodeBlockListDownloader from '../../domain/services/NodeBlockListDownloader';
import NodeBlockPolicy from '../../domain/services/NodeBlockPolicy';
import { NodeBlockSourceFetchOutcome } from '../../domain/value-objects/NodeBlockSourceFetchOutcome';

/**
 * Fetches every adopted source whose last fetch is older than the interval,
 * one at a time. Downloads run outside the policy's change queue; the result
 * is applied inside it against the source as stored then, so a source the
 * owner removed or reconfigured meanwhile is not overwritten.
 */
export default class NodeBlockSourcesRefresher {
  constructor(
    private readonly repository: NodeBlockSourceRepository,
    private readonly downloader: NodeBlockListDownloader,
    private readonly policy: NodeBlockPolicy,
    private readonly limits: NodeBlockSourceFetchLimits,
  ) {}

  private async download(
    source: NodeBlockSource,
  ): Promise<NodeBlockList | NodeBlockSourceFetchOutcome> {
    try {
      return await this.downloader.download(source.getOrigin());
    } catch (error) {
      if (error instanceof NodeBlockSourceFetchFailedError) {
        return error.outcome;
      }

      return NodeBlockSourceFetchOutcome.UNREACHABLE;
    }
  }

  private async record(
    fetched: NodeBlockSource,
    result: NodeBlockList | NodeBlockSourceFetchOutcome,
    at: Timestamp,
  ): Promise<void> {
    const ownerIdentityId = fetched.getOwnerIdentityId();

    if (!(await this.repository.exists(ownerIdentityId))) {
      return;
    }

    const source = await this.repository.find(ownerIdentityId);

    if (!source.getOrigin().isEqual(fetched.getOrigin())) {
      return;
    }

    if (result instanceof NodeBlockList) {
      source.receive(result, at);
    } else {
      source.fetchFailed(result, at);
    }

    await this.repository.save(source);
  }

  private async refreshSource(
    source: NodeBlockSource,
    now: Timestamp,
  ): Promise<void> {
    const result = await this.download(source);

    await this.policy.change(() => this.record(source, result, now));
  }

  public async refresh(now: Timestamp): Promise<void> {
    const threshold = now.addMilliseconds(
      -this.limits.interval.getTotalMilliseconds().valueOf(),
    );
    const due = (await this.repository.findAll()).filter((source) =>
      source.wasFetchedBefore(threshold),
    );

    for (const source of due) {
      await this.refreshSource(source, now);
    }
  }
}
