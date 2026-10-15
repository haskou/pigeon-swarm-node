import { NodeBlockSourceFetchFailedError } from '@app/contexts/nodes/domain/errors/NodeBlockSourceFetchFailedError';
import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockListPrimitives } from '@app/contexts/nodes/domain/NodeBlockListPrimitives';
import { NodeBlockSourceFetchLimits } from '@app/contexts/nodes/domain/NodeBlockSourceFetchLimits';
import NodeBlockListDownloader from '@app/contexts/nodes/domain/services/NodeBlockListDownloader';
import { NodeBlockSourceFetchOutcome } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceFetchOutcome';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import PublicHttpGetter from '@app/shared/infrastructure/http/public-url/PublicHttpGetter';
import { PublicHttpResponse } from '@app/shared/infrastructure/http/public-url/PublicHttpResponse';
import { PublicHttpResponseTooLargeError } from '@app/shared/infrastructure/http/public-url/PublicHttpResponseTooLargeError';
import { UrlIsNotPublicError } from '@app/shared/infrastructure/http/public-url/UrlIsNotPublicError';

/**
 * Downloads a published list over HTTPS from a public address only, without
 * following redirects, within the fetch timeout, and stops reading as soon as
 * the document passes `NODE_BLOCK_LIST_MAX_BYTES`. The document is parsed only
 * once it was read in full within that limit.
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

  private static parse(body: Buffer): NodeBlockList {
    try {
      return NodeBlockList.fromPrimitives(
        JSON.parse(body.toString('utf8')) as NodeBlockListPrimitives,
      );
    } catch {
      throw new NodeBlockSourceFetchFailedError(
        NodeBlockSourceFetchOutcome.INVALID_DOCUMENT,
      );
    }
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

  public async download(origin: NodeBlockSourceOrigin): Promise<NodeBlockList> {
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

    return HttpNodeBlockListDownloader.parse(response.body);
  }
}
