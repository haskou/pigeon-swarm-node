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
export class PostPublicIPFSContentRoute extends IPFSContentUploadRoute {
  @Post('/public')
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
    const published = await this.publisher().publishPublic({
      body: this.bodyFrom(request),
      contentType,
      filename,
      ownerIdentityId: await this.authenticate(request),
    });

    return response.status(HttpRouteStatusEnum.CREATED).json(published);
  }
}
