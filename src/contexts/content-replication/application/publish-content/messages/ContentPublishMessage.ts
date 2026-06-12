import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class ContentPublishMessage {
  public readonly body: Buffer;
  public readonly contentType?: string;
  public readonly filename?: string;
  public readonly ownerIdentityId: IdentityId;

  constructor(params: {
    body: Buffer;
    contentType?: string;
    filename?: string;
    ownerIdentityId: string;
  }) {
    this.body = params.body;
    this.contentType = params.contentType;
    this.filename = params.filename;
    this.ownerIdentityId = new IdentityId(params.ownerIdentityId);
  }
}
