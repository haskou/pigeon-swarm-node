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

import { maxIPFSContentSizeBytes } from '../IPFSContentLimits';
import { IPFSContentUploadRoute } from './IPFSContentUploadRoute';

@JsonController('/ipfs')
export class PostPrivateIPFSContentRoute extends IPFSContentUploadRoute {
  @Post('/private')
  @Post('/secure')
  @UseBefore(
    express.raw({
      limit: `${maxIPFSContentSizeBytes}b`,
      type: '*/*',
    }),
  )
  public async request(
    @HeaderParam('content-type') contentType: string | undefined,
    @HeaderParam('x-filename') filename: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const published = await this.publisher().publishPrivate({
      body: this.bodyFrom(request),
      filename,
      contentType,
      ownerIdentityId: await this.authenticate(request),
    });

    return response.status(HttpRouteStatusEnum.CREATED).json(published);
  }
}
