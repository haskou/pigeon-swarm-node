import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

export class PrivateContentPublishMessage {
  public readonly body: Buffer;
  public readonly contentType?: string;
  public readonly filename?: string;
  public readonly networkId: NetworkId;
  public readonly ownerIdentityId: IdentityId;

  constructor(params: {
    body: Buffer;
    contentType?: string;
    filename?: string;
    networkId: string;
    ownerIdentityId: string;
  }) {
    this.body = params.body;
    this.contentType = params.contentType;
    this.filename = params.filename;
    this.networkId = new NetworkId(params.networkId);
    this.ownerIdentityId = new IdentityId(params.ownerIdentityId);
  }
}
