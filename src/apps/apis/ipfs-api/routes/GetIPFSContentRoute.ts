import ContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/mongo/MongoIPFSContentReplicationRepository';
import { IPFSContentNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

type IPFSContentResponse =
  | {
      kind: 'binary';
      bytes: Buffer;
    }
  | {
      kind: 'json';
      content: unknown;
    };

@JsonController('/ipfs')
export class GetIPFSContentRoute extends Route {
  private contentDisposition(filename: string): string {
    const asciiFilename = filename
      .replace(/[\r\n"]/g, '')
      .replace(/[^\x20-\x7E]/g, '_');

    return `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  private contentReplicationRepository(): ContentReplicationRepository {
    return new ContentReplicationRepository(this.get<MongoDB>(MongoDB));
  }

  private async contentResponseMetadata(cid: IPFSId): Promise<{
    contentType: string;
    filename?: string;
  }> {
    const content = await this.contentReplicationRepository().findByCid(cid);

    return {
      contentType:
        content?.getContentType().valueOf() ?? 'application/octet-stream',
      filename: content?.getFilename()?.valueOf(),
    };
  }

  private async getPublicBytes(cid: IPFSId): Promise<Buffer | undefined> {
    try {
      return await this.ipfs().getBytes(cid);
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        return undefined;
      }

      throw error;
    }
  }

  private async getPublicJSON(cid: IPFSId): Promise<unknown | undefined> {
    try {
      return await this.ipfs().getJSON(cid);
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        return undefined;
      }

      throw error;
    }
  }

  private async getFirstAvailableContent(
    cid: IPFSId,
  ): Promise<IPFSContentResponse> {
    try {
      return await Promise.any([
        this.getPublicBytes(cid).then((bytes) => {
          if (bytes === undefined) {
            throw new IPFSContentNotFoundError(cid.valueOf());
          }

          return {
            kind: 'binary' as const,
            bytes,
          };
        }),
        this.getPublicJSON(cid).then((content) => {
          if (content === undefined) {
            throw new IPFSContentNotFoundError(cid.valueOf());
          }

          return {
            kind: 'json' as const,
            content,
          };
        }),
      ]);
    } catch {
      throw new IPFSContentNotFoundError(cid.valueOf());
    }
  }

  private ipfs(): IPFS {
    return this.get<IPFS>(IPFS);
  }

  @Get('/:cid')
  public async request(
    @Param('cid') cid: string,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const ipfsId = new IPFSId(cid);
      const content = await this.getFirstAvailableContent(ipfsId);

      if (content.kind === 'binary') {
        const metadata = await this.contentResponseMetadata(ipfsId);
        response.status(HttpRouteStatusEnum.OK).type(metadata.contentType);

        if (metadata.filename) {
          response.setHeader(
            'Content-Disposition',
            this.contentDisposition(metadata.filename),
          );
        }

        return response.send(content.bytes);
      }

      return response.status(HttpRouteStatusEnum.OK).json(content.content);
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
