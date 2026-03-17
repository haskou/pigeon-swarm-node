import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

@JsonController('/ipfs')
export class GetIPFSContentRoute extends Route {
  private readonly ipfs: IPFS = this.get<IPFS>(IPFS);

  @Get('/:cid')
  public async request(
    @Param('cid') cid: string,
    @Res() response: Response,
  ): Promise<Response> {
    const content = await this.ipfs.getJSON(new IPFSId(cid));

    return content
      ? response.status(HttpRouteStatusEnum.OK).json(content)
      : response
          .status(HttpRouteStatusEnum.NOT_FOUND)
          .json({ error: 'CID not found in any network' });
  }
}
