import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

export class NodeOwnerAssignerMessage {
  constructor(
    public readonly owner: IdentityId,
    public readonly authenticatedIdentityId: IdentityId,
  ) {}
}
