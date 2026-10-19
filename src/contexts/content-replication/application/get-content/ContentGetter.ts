import { ReplicatedContentNotFoundError } from '../../domain/errors/ReplicatedContentNotFoundError';
import { ContentTypeSniffer } from '../../domain/services/ContentTypeSniffer';
import { ContentId } from '../../domain/value-objects/ContentId';
import ReplicatedContentStorage from '../content-storage/ReplicatedContentStorage';
import { ContentGetResult } from './ContentGetResult';
import { ContentGetMessage } from './messages/ContentGetMessage';

interface PublicBytesRead {
  bytes?: Buffer;
  failure?: unknown;
}

export default class ContentGetter {
  constructor(private readonly contentStorage: ReplicatedContentStorage) {}

  private async readPublicBytes(cid: ContentId): Promise<PublicBytesRead> {
    try {
      return { bytes: await this.contentStorage.findBytes(cid) };
    } catch (error: unknown) {
      if (error instanceof ReplicatedContentNotFoundError) {
        return {};
      }

      // A failed bytes read is not proof of absence: a JSON block cannot be
      // read as bytes. Keep the failure so it decides the answer only when the
      // JSON read finds nothing either.
      return { failure: error };
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
    const bytesRead = await this.readPublicBytes(message.cid);

    if (bytesRead.bytes !== undefined) {
      return ContentGetResult.binary({
        bytes: bytesRead.bytes,
        ...ContentTypeSniffer.sniff(bytesRead.bytes),
      });
    }

    if (!isRawCid) {
      const content = await this.getPublicJSON(message.cid);

      if (content !== undefined) {
        return ContentGetResult.json(content);
      }
    }

    throw bytesRead.failure ?? new ReplicatedContentNotFoundError(message.cid);
  }
}
