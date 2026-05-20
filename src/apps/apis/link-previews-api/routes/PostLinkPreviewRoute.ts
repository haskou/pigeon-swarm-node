import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostLinkPreviewBody } from '../bodies/PostLinkPreviewBody';
import { LinkPreviewCacheRepository } from '../services/LinkPreviewCacheRepository';
import { LinkPreviewFetcher } from '../services/LinkPreviewFetcher';
import { LinkPreviewRateLimiter } from '../services/LinkPreviewRateLimiter';

@JsonController('/link-previews')
export class PostLinkPreviewRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private mongo(): MongoDB {
    return this.get<MongoDB>(MongoDB);
  }

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

    await new LinkPreviewRateLimiter(this.mongo()).consume(
      identityId,
      this.requesterIp(request),
    );

    const preview = await new LinkPreviewFetcher(
      new LinkPreviewCacheRepository(this.mongo()),
    ).fetch(body.url);

    return response.status(HttpRouteStatusEnum.OK).send(preview);
  }
}
