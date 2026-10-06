import ContentGetter from '@app/contexts/content-replication/application/get-content/ContentGetter';
import { ContentGetMessage } from '@app/contexts/content-replication/application/get-content/messages/ContentGetMessage';
import { ReplicatedContentNotFoundError } from '@app/contexts/content-replication/domain/errors/ReplicatedContentNotFoundError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

@JsonController('/ipfs')
export class GetIPFSContentRoute extends Route {
  private readonly getter = this.get<ContentGetter>(ContentGetter);

  @Get('/:cid')
  public async request(
    @Param('cid') cid: string,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const content = await this.getter.get(new ContentGetMessage(cid));

      if (content.isBinary()) {
        const binary = content.getBinaryResponse();

        response
          .status(HttpRouteStatusEnum.OK)
          .type(binary.contentType)
          .setHeader('X-Content-Type-Options', 'nosniff');

        if (!binary.inline) {
          response.setHeader('Content-Disposition', 'attachment');
        }

        return response.send(binary.bytes);
      }

      return response
        .status(HttpRouteStatusEnum.OK)
        .setHeader('X-Content-Type-Options', 'nosniff')
        .json(content.getJsonResponse());
    } catch (error: unknown) {
      if (error instanceof ReplicatedContentNotFoundError) {
        return response
          .status(HttpRouteStatusEnum.NOT_FOUND)
          .json({ error: 'CID not found in any network' });
      }

      throw error;
    }
  }
}
