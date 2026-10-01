import { assert } from '@haskou/value-objects';

import DeviceAuthorizationAccessPolicy from '../../../identity-devices/domain/services/DeviceAuthorizationAccessPolicy';
import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { InvalidPrivateAuthorizationError } from '../../domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationCheckpoint } from '../../domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '../../domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '../../domain/PrivateControlOperation';
import { PrivateAuthorizationRepository } from '../../domain/repositories/PrivateAuthorizationRepository';
import { PrivateDeviceCredentialCodec } from '../../domain/services/PrivateDeviceCredentialCodec';
import { AuthenticatedPrivateOperationJson } from '../../domain/value-objects/AuthenticatedPrivateOperationJson';
import { PrivateAuthorizationDeviceKey } from '../../domain/value-objects/PrivateAuthorizationDeviceKey';
import { PrivateOperationAuthenticator } from './PrivateOperationAuthenticator';
import { PrivateOperationDecoder } from './PrivateOperationDecoder';

export default class PrivateOperationAuthorizer {
  public constructor(
    private readonly repository: PrivateAuthorizationRepository,
    private readonly operationVerifier: PrivateOperationAuthenticator,
    private readonly contract: PrivateOperationDecoder,
    private readonly deviceAuthorization: DeviceAuthorizationAccessPolicy,
    private readonly credentialCodec: PrivateDeviceCredentialCodec,
  ) {}

  private async scopeFor(
    operation: PrivateControlOperation,
  ): Promise<PrivateAuthorizationScope> {
    const scope = await this.repository.findScope(
      operation.toPrimitives().scopeId,
    );

    assert(scope, new InvalidPrivateAuthorizationError());

    return scope;
  }

  private verify(
    signedOperationJson: string,
    routed: PrivateControlOperation,
    scope: PrivateAuthorizationScope,
    expectedAuthor: PrivateAuthorizationDeviceKey,
  ): {
    authenticatedOperation: AuthenticatedPrivateOperationJson;
    operation: PrivateControlOperation;
    scope: PrivateAuthorizationScope;
  } {
    try {
      const authenticatedOperation = this.operationVerifier.verify(
        signedOperationJson,
        expectedAuthor.valueOf(),
      );
      const operation = this.contract.decode(authenticatedOperation.valueOf());

      assert(
        operation.isAuthoredBy(expectedAuthor) &&
          operation.toPrimitives().scopeId ===
            scope.getCheckpoint().getScopeId().valueOf(),
        new InvalidPrivateAuthorizationError(),
      );

      return {
        authenticatedOperation,
        operation,
        scope,
      };
    } catch {
      throw new InvalidPrivateAuthorizationError();
    }
  }

  private assertAuthorizedDevice(
    operation: PrivateControlOperation,
  ): Promise<void> {
    return this.deviceAuthorization.assertAuthorized(
      operation.getAuthorIdentityId(),
      this.credentialCodec.toCredential(operation.getAuthorDeviceKey()),
      operation.getIdentityAuthorizationEpoch(),
      operation.getIdentityAuthorizationRevision(),
    );
  }

  public decode(signedOperationJson: string): PrivateControlOperation {
    return this.contract.decode(signedOperationJson);
  }

  public async authorize(
    signedOperationJson: string,
    routed: PrivateControlOperation = this.decode(signedOperationJson),
  ): Promise<{
    authenticatedOperation: AuthenticatedPrivateOperationJson;
    operation: PrivateControlOperation;
    scope: PrivateAuthorizationScope;
  }> {
    const scope = await this.scopeFor(routed);
    const checkpoint = scope.getCheckpoint();

    assert(
      checkpoint.admitsIdentityDevice(
        routed.getAuthorIdentityId(),
        routed.getAuthorDeviceKey(),
      ),
      new InvalidPrivateAuthorizationError(),
    );
    await this.assertAuthorizedDevice(routed);

    return this.verify(
      signedOperationJson,
      routed,
      scope,
      routed.getAuthorDeviceKey(),
    );
  }

  public async authorizeHistorical(
    signedOperationJson: string,
    routed: PrivateControlOperation = this.decode(signedOperationJson),
    parentCheckpoint: PrivateAuthorizationCheckpoint,
  ): Promise<{
    authenticatedOperation: AuthenticatedPrivateOperationJson;
    operation: PrivateControlOperation;
    scope: PrivateAuthorizationScope;
  }> {
    const scope = await this.scopeFor(routed);

    assert(
      parentCheckpoint.getScopeId().isEqual(routed.getScopeId()) &&
        parentCheckpoint
          .getRevision()
          .isEqual(routed.getAuthorizationRevision()) &&
        parentCheckpoint.admitsIdentityDevice(
          routed.getAuthorIdentityId(),
          routed.getAuthorDeviceKey(),
        ),
      new InvalidPrivateAuthorizationError(),
    );
    await this.assertAuthorizedDevice(routed);

    return this.verify(
      signedOperationJson,
      routed,
      scope,
      routed.getAuthorDeviceKey(),
    );
  }

  public async authorizeReceiptConflict(
    signedOperationJson: string,
    routed: PrivateControlOperation,
    receipt: PrivateControlOperation,
  ): Promise<void> {
    const scope = await this.scopeFor(routed);

    assert(
      receipt.hasSameIdentityAs(routed) &&
        receipt.isAuthoredBy(routed.getAuthorDeviceKey()) &&
        receipt.isAuthoredByIdentity(routed.getAuthorIdentityId()),
      new InvalidPrivateAuthorizationError(),
    );
    await this.assertAuthorizedDevice(routed);

    this.verify(
      signedOperationJson,
      routed,
      scope,
      receipt.getAuthorDeviceKey(),
    );
  }

  public assertAuthoredBy(
    operation: PrivateControlOperation,
    identityId: IdentityId,
  ): void {
    assert(
      operation.isAuthoredByIdentity(identityId),
      new InvalidPrivateAuthorizationError(),
    );
  }
}
