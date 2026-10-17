import { NodeBlockSourceFetchFailedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceFetchFailedError';
import { NodeBlockSourceFetchLimits } from '@app/contexts/nodes/domain/NodeBlockSourceFetchLimits';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import HttpNodeBlockListDownloader from '@app/contexts/nodes/infrastructure/block-sources/HttpNodeBlockListDownloader';
import { PublicHttpFetchError } from '@app/shared/infrastructure/http/public-url/PublicHttpFetchError';
import PublicHttpGetter from '@app/shared/infrastructure/http/public-url/PublicHttpGetter';
import { PublicHttpResponseTooLargeError } from '@app/shared/infrastructure/http/public-url/PublicHttpResponseTooLargeError';
import { UrlIsNotPublicError } from '@app/shared/infrastructure/http/public-url/UrlIsNotPublicError';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Duration } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

import { NodeBlockListMother } from '../../../../mothers/NodeBlockListMother';

describe('HttpNodeBlockListDownloader', () => {
  const origin = new NodeBlockSourceOrigin('https://publisher.example');
  const limits = new NodeBlockSourceFetchLimits(
    Duration.fromHours(1),
    4096,
    Duration.fromSeconds(30),
  );
  let getter: MockProxy<PublicHttpGetter>;
  let downloader: HttpNodeBlockListDownloader;

  const outcomeOf = async (): Promise<NodeBlockSourceFetchOutcome> => {
    try {
      await downloader.download(origin);
    } catch (error) {
      if (error instanceof NodeBlockSourceFetchFailedError) {
        return error.outcome;
      }

      throw error;
    }

    throw new Error('The download should have failed.');
  };

  beforeEach(() => {
    getter = mock<PublicHttpGetter>();
    downloader = new HttpNodeBlockListDownloader(getter, limits);
  });

  it('should return the exact served bytes with the signature of their header', async () => {
    const mother = new NodeBlockListMother(
      await KeyPair.generate(),
    ).withVersion(3);
    const signed = mother.signed();

    getter.get.mockResolvedValue({
      body: signed.getContent(),
      headers: {
        'x-identity-signature': signed.getIdentitySignature().valueOf(),
      },
      redirectLocation: undefined,
      statusCode: 200,
    });

    const downloaded = await downloader.download(origin);

    expect(downloaded.isEqual(signed)).toBe(true);
    expect(getter.get).toHaveBeenCalledWith(
      new URL('https://publisher.example/node/published-blocks'),
      expect.objectContaining({
        accept: 'application/json',
        expectedContentType: 'application/json',
        maxBytes: 4096,
        timeoutMs: 30000,
      }),
    );
  });

  it('should leave the bytes unread, even when they are not JSON', async () => {
    const signed = new NodeBlockListMother(await KeyPair.generate()).signing(
      'not json',
    );

    getter.get.mockResolvedValue({
      body: signed.getContent(),
      headers: {
        'x-identity-signature': signed.getIdentitySignature().valueOf(),
      },
      redirectLocation: undefined,
      statusCode: 200,
    });

    expect((await downloader.download(origin)).isEqual(signed)).toBe(true);
  });

  it.each([
    ['missing', {}],
    ['not a signature', { 'x-identity-signature': 'not-a-signature' }],
    ['repeated', { 'x-identity-signature': ['a', 'b'] }],
  ])(
    'should report a signature header that is %s as an invalid signature',
    async (_, headers) => {
      getter.get.mockResolvedValue({
        body: new NodeBlockListMother(await KeyPair.generate()).content(),
        headers,
        redirectLocation: undefined,
        statusCode: 200,
      });

      expect(await outcomeOf()).toEqual(
        NodeBlockSourceFetchOutcome.INVALID_SIGNATURE,
      );
    },
  );

  it('should report a document above the byte limit as too large', async () => {
    getter.get.mockRejectedValue(new PublicHttpResponseTooLargeError());

    expect(await outcomeOf()).toEqual(NodeBlockSourceFetchOutcome.TOO_LARGE);
  });

  it('should report a private or loopback address as refused', async () => {
    getter.get.mockRejectedValue(new UrlIsNotPublicError());

    expect(await outcomeOf()).toEqual(
      NodeBlockSourceFetchOutcome.REFUSED_ADDRESS,
    );
  });

  it('should not follow a redirect', async () => {
    getter.get.mockResolvedValue({
      body: Buffer.alloc(0),
      headers: {},
      redirectLocation: new URL('https://elsewhere.example/'),
      statusCode: 302,
    });

    expect(await outcomeOf()).toEqual(NodeBlockSourceFetchOutcome.REDIRECTED);
    expect(getter.get).toHaveBeenCalledTimes(1);
  });

  it('should report a failed request or a non-200 answer as unreachable', async () => {
    getter.get.mockRejectedValueOnce(new PublicHttpFetchError('Timed out.'));
    getter.get.mockResolvedValueOnce({
      body: Buffer.alloc(0),
      headers: {},
      redirectLocation: undefined,
      statusCode: 404,
    });

    expect(await outcomeOf()).toEqual(NodeBlockSourceFetchOutcome.UNREACHABLE);
    expect(await outcomeOf()).toEqual(NodeBlockSourceFetchOutcome.UNREACHABLE);
  });
});
