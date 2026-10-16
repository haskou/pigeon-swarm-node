import NodeBlockSourcesRefresher from '@app/contexts/nodes/application/refresh-block-sources/NodeBlockSourcesRefresher';
import { NodeBlockSourceFetchFailedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceFetchFailedError';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import { NodeBlockSourceFetchLimits } from '@app/contexts/nodes/domain/NodeBlockSourceFetchLimits';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeBlockListDownloader from '@app/contexts/nodes/domain/services/NodeBlockListDownloader';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { SignedNodeBlockList } from '@app/contexts/nodes/domain/SignedNodeBlockList';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Duration, Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

describe('NodeBlockSourcesRefresher', () => {
  const now = new Timestamp(1770000000000);
  const origin = new NodeBlockSourceOrigin('https://publisher.example');
  let publisher: KeyPair;
  let stranger: KeyPair;
  let blocked: IdentityId;
  let repository: MockProxy<NodeBlockSourceRepository>;
  let downloader: MockProxy<NodeBlockListDownloader>;
  let policy: MockProxy<NodeBlockPolicy>;
  let refresher: NodeBlockSourcesRefresher;
  let stored: NodeBlockSource;

  const list = (signer: KeyPair, version: number): SignedNodeBlockList =>
    new NodeBlockListMother(signer)
      .withVersion(version)
      .blockingIdentities([blocked])
      .signed();

  const adopted = (autoApply = false): NodeBlockSource =>
    NodeBlockSource.adopt(
      new IdentityId(publisher.toPrimitives().publicKey),
      origin,
      autoApply,
      new NodeBlockSourceVersionFloor(0),
    );

  const copy = (source: NodeBlockSource): NodeBlockSource =>
    NodeBlockSource.fromPrimitives(source.toPrimitives());

  const saved = (): NodeBlockSource =>
    repository.save.mock.calls[repository.save.mock.calls.length - 1][0];

  beforeAll(async () => {
    publisher = await KeyPair.generate();
    stranger = await KeyPair.generate();
    blocked = await NodeBlockListMother.identityId();
  });

  beforeEach(() => {
    repository = mock<NodeBlockSourceRepository>();
    downloader = mock<NodeBlockListDownloader>();
    policy = mock<NodeBlockPolicy>();
    policy.change.mockImplementation((mutation) => mutation());
    stored = adopted();
    repository.findAll.mockImplementation(async () => [copy(stored)]);
    repository.exists.mockResolvedValue(true);
    repository.find.mockImplementation(async () => copy(stored));
    refresher = new NodeBlockSourcesRefresher(
      repository,
      downloader,
      policy,
      new NodeBlockSourceFetchLimits(
        Duration.fromHours(1),
        4096,
        Duration.fromSeconds(30),
      ),
    );
  });

  it('should keep a newer list signed by the pinned owner, with additions pending', async () => {
    downloader.download.mockResolvedValue(list(publisher, 2));

    await refresher.refresh(now);

    expect(downloader.download).toHaveBeenCalledWith(origin);
    expect(policy.change).toHaveBeenCalledTimes(1);
    expect(saved().toPrimitives().list?.version).toBe(2);
    expect(saved().toPrimitives().lastFetch).toEqual({
      at: now.valueOf(),
      outcome: 'accepted',
    });
    expect(saved().applied().count()).toBe(0);
    expect(saved().pending().count()).toBe(1);
  });

  it('should apply additions on fetch when the source auto-applies', async () => {
    stored = adopted(true);
    downloader.download.mockResolvedValue(list(publisher, 1));

    await refresher.refresh(now);

    expect(saved().applied().count()).toBe(1);
  });

  it('should keep the last valid list when a document is signed by someone else', async () => {
    stored.receive(list(publisher, 2), new Timestamp(1));
    downloader.download.mockResolvedValue(list(stranger, 9));

    await refresher.refresh(now);

    expect(saved().toPrimitives().list?.version).toBe(2);
    expect(saved().toPrimitives().lastFetch?.outcome).toBe(
      'invalid-signature',
    );
  });

  it('should keep the last valid list on a rollback to an older version', async () => {
    stored.receive(list(publisher, 2), new Timestamp(1));
    downloader.download.mockResolvedValue(list(publisher, 1));

    await refresher.refresh(now);

    expect(saved().toPrimitives().list?.version).toBe(2);
    expect(saved().toPrimitives().lastFetch?.outcome).toBe('not-newer');
  });

  it('should keep the last valid list and record why a download failed', async () => {
    stored.receive(list(publisher, 2), new Timestamp(1));
    downloader.download.mockRejectedValue(
      new NodeBlockSourceFetchFailedError(
        NodeBlockSourceFetchOutcome.TOO_LARGE,
      ),
    );

    await refresher.refresh(now);

    expect(saved().toPrimitives().list?.version).toBe(2);
    expect(saved().toPrimitives().lastFetch?.outcome).toBe('too-large');
  });

  it('should record any other download error as unreachable', async () => {
    downloader.download.mockRejectedValue(new Error('boom'));

    await refresher.refresh(now);

    expect(saved().toPrimitives().lastFetch?.outcome).toBe('unreachable');
  });

  it('should not fetch a source fetched within the interval', async () => {
    stored.fetchFailed(
      NodeBlockSourceFetchOutcome.UNREACHABLE,
      now.addMilliseconds(-60 * 1000),
    );

    await refresher.refresh(now);

    expect(downloader.download).not.toHaveBeenCalled();
  });

  it('should drop the result for a source removed during the download', async () => {
    downloader.download.mockResolvedValue(list(publisher, 2));
    repository.exists.mockResolvedValue(false);

    await refresher.refresh(now);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('should drop the result for a source moved to another origin during the download', async () => {
    downloader.download.mockResolvedValue(list(publisher, 2));
    repository.find.mockImplementation(async () => {
      const moved = copy(stored);

      moved.reconfigure(
        new NodeBlockSourceOrigin('https://moved.example'),
        false,
      );

      return moved;
    });

    await refresher.refresh(now);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
