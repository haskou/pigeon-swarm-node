import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostLinkPreviewBody } from '../bodies/PostLinkPreviewBody';
import LinkPreviewFetcher from '../services/LinkPreviewFetcher';
import LinkPreviewRateLimiter from '../services/LinkPreviewRateLimiter';

@JsonController('/link-previews')
export class PostLinkPreviewRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly fetcher = this.get<LinkPreviewFetcher>(LinkPreviewFetcher);

  private readonly rateLimiter = this.get<LinkPreviewRateLimiter>(
    LinkPreviewRateLimiter,
  );

  private requesterIp(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  @Post('/')
  public async createPreview(
    @Body() body: PostLinkPreviewBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);

    await this.rateLimiter.consume(identityId, this.requesterIp(request));

    const preview = await this.fetcher.fetch(body.url);

    return response.status(HttpRouteStatusEnum.OK).send(preview);
  }
}
