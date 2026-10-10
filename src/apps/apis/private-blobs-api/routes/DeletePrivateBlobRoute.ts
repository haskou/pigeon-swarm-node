import PrivateBlobRemover from '@app/contexts/private-blobs/application/PrivateBlobRemover';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { PrivateBlobRouteSupport } from './PrivateBlobRouteSupport';

/** Only the uploader capability can withdraw a blob before its retention ends. */
@JsonController('/private-blobs')
export class DeletePrivateBlobRoute extends PrivateBlobRouteSupport {
  private readonly remover = this.get<PrivateBlobRemover>(PrivateBlobRemover);

  @Delete('/:blobId')
  public async request(
    @Param('blobId') blobId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      await this.remover.remove(blobId, this.bearerToken(request));

      return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
