import { PrivateAuthorizationCheckpoint } from './PrivateAuthorizationCheckpoint';
import { PrivateControlOperationPrimitives } from './PrivateControlOperationPrimitives';
import { PrivateAuthorizationDeviceKey } from './value-objects/PrivateAuthorizationDeviceKey';
import { PrivateAuthorizationRevision } from './value-objects/PrivateAuthorizationRevision';
import { PrivateAuthorizationScopeId } from './value-objects/PrivateAuthorizationScopeId';

export class PrivateControlOperation {
  public static fromPrimitives(
    primitives: PrivateControlOperationPrimitives,
  ): PrivateControlOperation {
    return new PrivateControlOperation(primitives);
  }

  private constructor(
    private readonly primitives: PrivateControlOperationPrimitives,
  ) {}

  public isAuthoredBy(deviceKey: PrivateAuthorizationDeviceKey): boolean {
    return this.primitives.authorDeviceKey === deviceKey.valueOf();
  }

  public getAuthorDeviceKey(): PrivateAuthorizationDeviceKey {
    return new PrivateAuthorizationDeviceKey(this.primitives.authorDeviceKey);
  }

  public getAuthorizationRevision(): PrivateAuthorizationRevision {
    return new PrivateAuthorizationRevision(
      this.primitives.authorizationRevision,
    );
  }

  public getScopeId(): PrivateAuthorizationScopeId {
    return new PrivateAuthorizationScopeId(this.primitives.scopeId);
  }

  public isProposal(): boolean {
    return this.primitives.kind === 'membership.propose';
  }

  public isControlChildOf(checkpoint: PrivateAuthorizationCheckpoint): boolean {
    return (
      !this.isProposal() &&
      this.getScopeId().isEqual(checkpoint.getScopeId()) &&
      this.getAuthorizationRevision().isEqual(checkpoint.getRevision())
    );
  }

  public hasSameIdentityAs(operation: PrivateControlOperation): boolean {
    const candidate = operation.toPrimitives();

    return (
      this.primitives.id === candidate.id &&
      this.primitives.scopeId === candidate.scopeId
    );
  }

  public hasSameDigestAs(operation: PrivateControlOperation): boolean {
    return this.primitives.digest === operation.primitives.digest;
  }

  public toPrimitives(): PrivateControlOperationPrimitives {
    return {
      ...this.primitives,
      control: this.primitives.control
        ? { ...this.primitives.control }
        : undefined,
      mutation: { ...this.primitives.mutation },
      previousOperationIds: [...this.primitives.previousOperationIds],
    };
  }
}
