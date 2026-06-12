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

import { IPFSContentUploadRoute } from './IPFSContentUploadRoute';

@JsonController('/ipfs')
export class PostPrivateIPFSContentRoute extends IPFSContentUploadRoute {
  @Post('/private')
  @Post('/secure')
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
    const published = await this.publisher().publishPrivate(
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
