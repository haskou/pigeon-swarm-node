import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { IPFSContentNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';

import { ContentGetResult } from './ContentGetResult';
import { ContentGetMessage } from './messages/ContentGetMessage';

export default class ContentGetter {
  constructor(
    private readonly ipfs: IPFS,
    private readonly contentRepository: ContentReplicationRepository,
  ) {}

  private async getPublicBytes(cid: IPFSId): Promise<Buffer | undefined> {
    try {
      return await this.ipfs.getBytes(cid);
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        return undefined;
      }

      throw error;
    }
  }

  private async getPublicJSON(cid: IPFSId): Promise<unknown | undefined> {
    try {
      return await this.ipfs.getJSON(cid);
    } catch (error: unknown) {
      if (error instanceof IPFSContentNotFoundError) {
        return undefined;
      }

      throw error;
    }
  }

  private async metadata(cid: IPFSId): Promise<{
    contentType: string;
    filename?: string;
  }> {
    const content = await this.contentRepository.findByCid(cid);

    return {
      contentType:
        content?.getContentType().valueOf() ?? 'application/octet-stream',
      filename: content?.getFilename()?.valueOf(),
    };
  }

  public async get(message: ContentGetMessage): Promise<ContentGetResult> {
    try {
      return await Promise.any([
        this.getPublicBytes(message.cid).then(async (bytes) => {
          if (bytes === undefined) {
            throw new IPFSContentNotFoundError(message.cid.valueOf());
          }

          return {
            ...(await this.metadata(message.cid)),
            bytes,
            kind: 'binary' as const,
          };
        }),
        this.getPublicJSON(message.cid).then((content) => {
          if (content === undefined) {
            throw new IPFSContentNotFoundError(message.cid.valueOf());
          }

          return {
            content,
            kind: 'json' as const,
          };
        }),
      ]);
    } catch {
      throw new IPFSContentNotFoundError(message.cid.valueOf());
    }
  }
}
