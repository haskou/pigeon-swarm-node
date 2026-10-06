import { ReplicatedContentNotFoundError } from '../../domain/errors/ReplicatedContentNotFoundError';
import { ContentTypeSniffer } from '../../domain/services/ContentTypeSniffer';
import { ContentId } from '../../domain/value-objects/ContentId';
import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import { ContentGetResult } from './ContentGetResult';
import { ContentGetMessage } from './messages/ContentGetMessage';

export default class ContentGetter {
  constructor(private readonly contentStorage: ReplicatedContentStorage) {}

  private async getPublicBytes(cid: ContentId): Promise<Buffer | undefined> {
    try {
      return await this.contentStorage.findBytes(cid);
    } catch (error: unknown) {
      if (error instanceof ReplicatedContentNotFoundError) {
        return undefined;
      }

      throw error;
    }
  }

  private async getPublicJSON(cid: ContentId): Promise<unknown | undefined> {
    try {
      return await this.contentStorage.findJSON(cid);
    } catch (error: unknown) {
      if (error instanceof ReplicatedContentNotFoundError) {
        return undefined;
      }

      throw error;
    }
  }

  public async get(message: ContentGetMessage): Promise<ContentGetResult> {
    const isRawCid = await this.contentStorage.isRawContent(message.cid);
    const bytes = await this.getPublicBytes(message.cid);

    if (bytes !== undefined) {
      return ContentGetResult.binary({
        bytes,
        ...ContentTypeSniffer.sniff(bytes),
      });
    }

    if (isRawCid) {
      throw new ReplicatedContentNotFoundError(message.cid);
    }

    const content = await this.getPublicJSON(message.cid);

    if (content !== undefined) {
      return ContentGetResult.json(content);
    }

    throw new ReplicatedContentNotFoundError(message.cid);
  }
}
