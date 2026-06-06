import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export type PublishContentParams = {
  body: Buffer;
  contentType?: string;
  filename?: string;
  ownerIdentityId: IdentityId;
};
