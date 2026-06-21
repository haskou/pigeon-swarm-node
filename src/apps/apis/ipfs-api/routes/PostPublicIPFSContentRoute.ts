import { maxContentSizeBytes } from '@app/contexts/content-replication/application/publish-content/ContentUploadLimits';
import { ContentPublishMessage } from '@app/contexts/content-replication/application/publish-content/messages/ContentPublishMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import * as express from 'express';
import { Request, Response } from 'express';
import {
  HeaderParam,
  JsonController,
  Post,
  Req,
  Res,
  UseBefore,
} from 'routing-controllers';

import { IPFSContentUploadRouteSupport } from './IPFSContentUploadRouteSupport';

@JsonController('/ipfs')
export class PostPublicIPFSContentRoute extends IPFSContentUploadRouteSupport {
  @Post('/public')
  @UseBefore(
    express.raw({
      limit: `${maxContentSizeBytes}b`,
      type: '*/*',
    }),
  )
  public async request(
    @HeaderParam('content-type') contentType: string | undefined,
    @HeaderParam('x-filename') filename: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = await this.authenticate(request);
    const published = await this.publisher().publishPublic(
      new ContentPublishMessage({
        body: this.bodyFrom(request),
        contentType,
        filename,
        ownerIdentityId: ownerIdentityId.valueOf(),
      }),
    );

    return response.status(HttpRouteStatusEnum.CREATED).json(published);
  }
}
