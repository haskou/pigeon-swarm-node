import ContentGetter from '@app/contexts/content-replication/application/get-content/ContentGetter';
import { ContentGetMessage } from '@app/contexts/content-replication/application/get-content/messages/ContentGetMessage';
import { IPFSContentNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

@JsonController('/ipfs')
export class GetIPFSContentRoute extends Route {
  private readonly getter = this.get<ContentGetter>(ContentGetter);

  private contentDisposition(filename: string): string {
    const asciiFilename = filename
      .replace(/[\r\n"]/g, '')
      .replace(/[^\x20-\x7E]/g, '_');

    return `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  @Get('/:cid')
  public async request(
    @Param('cid') cid: string,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const content = await this.getter.get(new ContentGetMessage(cid));

      if (content.isBinary()) {
        const binary = content.getBinaryResponse();

        response.status(HttpRouteStatusEnum.OK).type(binary.contentType);

        if (binary.filename) {
          response.setHeader(
            'Content-Disposition',
            this.contentDisposition(binary.filename),
          );
        }

        return response.send(binary.bytes);
      }

      return response
        .status(HttpRouteStatusEnum.OK)
        .json(content.getJsonResponse());
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        return response
          .status(HttpRouteStatusEnum.NOT_FOUND)
          .json({ error: 'CID not found in any network' });
      }

      throw error;
    }
  }
}
