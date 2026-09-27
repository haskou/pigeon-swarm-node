import { PrivateControlOperationPrimitives } from './PrivateControlOperationPrimitives';
import { PrivateAuthorizationDeviceKey } from './value-objects/PrivateAuthorizationDeviceKey';

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
