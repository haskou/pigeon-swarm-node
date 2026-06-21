import { ContentId } from '../../../domain/value-objects/ContentId';

export class ContentGetMessage {
  public readonly cid: ContentId;

  constructor(cid: string) {
    this.cid = new ContentId(cid);
  }
}
