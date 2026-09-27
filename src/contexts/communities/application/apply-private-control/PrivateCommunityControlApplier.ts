import { PrivateControlMutationAuthorizer } from '@app/contexts/private-authorization/application/accept-operation/PrivateControlMutationAuthorizer';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateIdentityBinding } from '@app/contexts/private-authorization/domain/services/PrivateIdentityBinding';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { Community } from '../../domain/Community';
import { CommunityRoleId } from '../../domain/value-objects/CommunityRoleId';

export default class PrivateCommunityControlApplier extends PrivateControlMutationAuthorizer {
  public constructor(private readonly identityBinding: PrivateIdentityBinding) {
    super();
  }

  private community(projection: Record<string, unknown>): Community {
    try {
      return Community.fromPrimitives(
        projection as ReturnType<Community['toPrimitives']>,
      );
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private identity(value: unknown): IdentityId {
    if (typeof value !== 'string') {
      throw new InvalidPrivateAuthorizationError();
    }

    return new IdentityId(value);
  }

  private roles(value: unknown): CommunityRoleId[] {
    if (
      !Array.isArray(value) ||
      !value.every((role) => typeof role === 'string')
    ) {
      throw new InvalidPrivateAuthorizationError();
    }

    return value.map((role) => new CommunityRoleId(role));
  }

  private applyNow(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    projection: Record<string, unknown>,
  ): Record<string, unknown> {
    const value = operation.toPrimitives();
    const trusted = checkpoint.toPrimitives();

    if (
      !trusted.admittedDeviceKeys.includes(value.authorDeviceKey) ||
      trusted.revokedDeviceKeys.includes(value.authorDeviceKey)
    ) {
      throw new InvalidPrivateAuthorizationError();
    }
    const actor = new IdentityId(
      this.identityBinding.identityIdFor(value.authorDeviceKey),
    );
    const community = this.community(projection);
    const mutation = value.mutation;

    switch (mutation.type) {
      case 'member.admit':
        community.addMember(actor, this.identity(mutation.identityId));
        break;
      case 'member.ban':
        community.banMember(actor, this.identity(mutation.targetIdentityId));
        break;
      case 'member.remove':
        community.kickMember(actor, this.identity(mutation.targetIdentityId));
        break;
      case 'member.roles.set':
        community.assignRoles(
          actor,
          this.identity(mutation.targetIdentityId),
          this.roles(mutation.roleIds),
        );
        break;
      case 'device.revoke':
        return structuredClone(projection);
      default:
        throw new InvalidPrivateAuthorizationError();
    }

    return community.toPrimitives();
  }

  public apply(
    checkpoint: PrivateAuthorizationCheckpoint,
    operation: PrivateControlOperation,
    projection: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return Promise.resolve().then(() =>
      this.applyNow(checkpoint, operation, projection),
    );
  }
}
