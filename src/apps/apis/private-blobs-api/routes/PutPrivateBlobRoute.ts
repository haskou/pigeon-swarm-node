import PrivateBlobUploader from '@app/contexts/private-blobs/application/PrivateBlobUploader';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Param, Put, Req, Res } from 'routing-controllers';

import { PrivateBlobRouteSupport } from './PrivateBlobRouteSupport';

/** The body is streamed straight to storage; it is never parsed or buffered. */
@JsonController('/private-blobs')
export class PutPrivateBlobRoute extends PrivateBlobRouteSupport {
  private readonly uploader =
    this.get<PrivateBlobUploader>(PrivateBlobUploader);

  @Put('/:blobId')
  public async request(
    @Param('blobId') blobId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      await this.uploader.upload(blobId, this.bearerToken(request), request);

      return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
