import { NodeBlockSourceFetchFailedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceFetchFailedError';
import { NodeBlockSourceFetchLimits } from '@app/contexts/nodes/domain/NodeBlockSourceFetchLimits';
import NodeBlockListDownloader from '@app/contexts/nodes/domain/services/NodeBlockListDownloader';
import { SignedNodeBlockList } from '@app/contexts/nodes/domain/SignedNodeBlockList';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import PublicHttpGetter from '@app/shared/infrastructure/http/public-url/PublicHttpGetter';
import { PublicHttpResponse } from '@app/shared/infrastructure/http/public-url/PublicHttpResponse';
import { PublicHttpResponseTooLargeError } from '@app/shared/infrastructure/http/public-url/PublicHttpResponseTooLargeError';
import { UrlIsNotPublicError } from '@app/shared/infrastructure/http/public-url/UrlIsNotPublicError';
import { Signature } from '@haskou/pigeon-swarm-crypto';

/**
 * Downloads a published list over HTTPS from a public address only, without
 * following redirects, within the fetch timeout, and stops reading as soon as
 * the document passes `NODE_BLOCK_LIST_MAX_BYTES`. It returns the body bytes
 * unparsed with the `X-Identity-Signature` header: the source verifies them
 * against the pinned identity before any byte is parsed.
 */
export default class HttpNodeBlockListDownloader extends NodeBlockListDownloader {
  private static readonly ACCEPT = 'application/json';
  private static readonly USER_AGENT = 'PigeonSwarmNode-BlockSources/1.0';

  private static outcomeOf(error: unknown): NodeBlockSourceFetchOutcome {
    if (error instanceof PublicHttpResponseTooLargeError) {
      return NodeBlockSourceFetchOutcome.TOO_LARGE;
    }

    if (error instanceof UrlIsNotPublicError) {
      return NodeBlockSourceFetchOutcome.REFUSED_ADDRESS;
    }

    return NodeBlockSourceFetchOutcome.UNREACHABLE;
  }

  /** The publisher's signature, sent apart from the signed bytes. */
  private static identitySignatureOf(response: PublicHttpResponse): Signature {
    const header = response.headers['x-identity-signature'];

    try {
      if (typeof header === 'string') {
        return new Signature(header);
      }
    } catch {
      // A malformed signature is reported like a missing one.
    }

    throw new NodeBlockSourceFetchFailedError(
      NodeBlockSourceFetchOutcome.INVALID_SIGNATURE,
    );
  }

  constructor(
    private readonly getter: PublicHttpGetter,
    private readonly limits: NodeBlockSourceFetchLimits,
  ) {
    super();
  }

  private async get(url: URL): Promise<PublicHttpResponse> {
    try {
      return await this.getter.get(url, {
        accept: HttpNodeBlockListDownloader.ACCEPT,
        expectedContentType: HttpNodeBlockListDownloader.ACCEPT,
        maxBytes: this.limits.maxBytes,
        timeoutMs: this.limits.timeout.getTotalMilliseconds().valueOf(),
        userAgent: HttpNodeBlockListDownloader.USER_AGENT,
      });
    } catch (error) {
      throw new NodeBlockSourceFetchFailedError(
        HttpNodeBlockListDownloader.outcomeOf(error),
      );
    }
  }

  public async download(
    origin: NodeBlockSourceOrigin,
  ): Promise<SignedNodeBlockList> {
    const response = await this.get(origin.publishedListUrl());

    if (response.redirectLocation) {
      throw new NodeBlockSourceFetchFailedError(
        NodeBlockSourceFetchOutcome.REDIRECTED,
      );
    }

    if (response.statusCode !== 200) {
      throw new NodeBlockSourceFetchFailedError(
        NodeBlockSourceFetchOutcome.UNREACHABLE,
      );
    }

    return new SignedNodeBlockList(
      response.body,
      HttpNodeBlockListDownloader.identitySignatureOf(response),
    );
  }
}
