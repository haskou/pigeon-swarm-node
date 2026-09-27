import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceCredentialCommitment } from '@app/contexts/identities/domain/value-objects/DeviceCredentialCommitment';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { Timestamp, assert } from '@haskou/value-objects';

import { DeviceAuthorizationTransitionPrimitives } from './DeviceAuthorizationTransitionPrimitives';
import { DeviceAuthorizationTransitionState } from './DeviceAuthorizationTransitionState';
import { InvalidDeviceAuthorizationTransitionError } from './errors/InvalidDeviceAuthorizationTransitionError';
import { DeviceAuthorizationOperation } from './value-objects/DeviceAuthorizationOperation';
import { DeviceAuthorizationOperationId } from './value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationPayload } from './value-objects/DeviceAuthorizationPayload';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from './value-objects/PairingAuthorization';
import { PairingExpiration } from './value-objects/PairingExpiration';
import { PairingId } from './value-objects/PairingId';

export class DeviceAuthorizationTransition {
  private static readonly SIGNATURE_DOMAIN =
    'pigeon:device-authorization:transition:v2';

  private static readonly PROOF_DOMAIN =
    'pigeon:device-authorization:proof-of-possession:v1';

  public static enrollment(
    identityId: IdentityId,
    operationId: DeviceAuthorizationOperationId,
    previousRevision: DeviceAuthorizationRevision,
    authorCredential: DeviceCredential,
    targetCredential: DeviceCredential,
    pairing: PairingAuthorization,
  ): DeviceAuthorizationTransition {
    return new DeviceAuthorizationTransition({
      authorCredential,
      identityId,
      operation: DeviceAuthorizationOperation.enrollment(),
      operationId,
      pairing,
      previousRevision,
      targetCredential,
    });
  }

  public static fromPrimitives(
    primitives: DeviceAuthorizationTransitionPrimitives,
  ): DeviceAuthorizationTransition {
    const operation = new DeviceAuthorizationOperation(primitives.operation);
    const transition = new DeviceAuthorizationTransition({
      authorCredential: primitives.authorCredential
        ? DeviceCredential.fromString(primitives.authorCredential)
        : undefined,
      identityId: new IdentityId(primitives.identityId),
      operation,
      operationId: new DeviceAuthorizationOperationId(primitives.operationId),
      pairing:
        primitives.pairingId &&
        primitives.pairingExpiration !== undefined &&
        primitives.authorizedAt !== undefined
          ? new PairingAuthorization(
              new PairingId(primitives.pairingId),
              new PairingExpiration(primitives.pairingExpiration),
              new Timestamp(primitives.authorizedAt),
            )
          : undefined,
      previousRevision: new DeviceAuthorizationRevision(
        primitives.previousRevision,
      ),
      proofOfPossession: primitives.proofOfPossession
        ? new Signature(primitives.proofOfPossession)
        : undefined,
      signature: new Signature(primitives.signature),
      targetCredential: DeviceCredential.fromString(
        primitives.targetCredential,
      ),
    });

    assert(
      transition.getRevision().valueOf() === primitives.revision &&
        transition
          .getTargetCredentialCommitment()
          .hasValue(primitives.targetCredentialCommitment) &&
        transition.hasValidProofShape(),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return transition;
  }

  public static revocation(
    identityId: IdentityId,
    operationId: DeviceAuthorizationOperationId,
    previousRevision: DeviceAuthorizationRevision,
    authorCredential: DeviceCredential,
    targetCredential: DeviceCredential,
  ): DeviceAuthorizationTransition {
    return new DeviceAuthorizationTransition({
      authorCredential,
      identityId,
      operation: DeviceAuthorizationOperation.revocation(),
      operationId,
      previousRevision,
      targetCredential,
    });
  }

  public static recovery(
    identityId: IdentityId,
    operationId: DeviceAuthorizationOperationId,
    previousRevision: DeviceAuthorizationRevision,
    targetCredential: DeviceCredential,
  ): DeviceAuthorizationTransition {
    return new DeviceAuthorizationTransition({
      identityId,
      operation: DeviceAuthorizationOperation.recovery(),
      operationId,
      previousRevision,
      targetCredential,
    });
  }

  private constructor(
    private readonly state: DeviceAuthorizationTransitionState,
  ) {
    assert(
      this.hasValidOperationShape(),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private hasValidOperationShape(): boolean {
    if (this.state.operation.isEnrollment()) {
      return Boolean(this.state.authorCredential && this.state.pairing);
    }

    if (this.state.operation.isRevocation()) {
      return Boolean(this.state.authorCredential && !this.state.pairing);
    }

    return Boolean(
      this.state.operation.isRecovery() &&
      !this.state.authorCredential &&
      !this.state.pairing,
    );
  }

  private hasValidProofShape(): boolean {
    return this.isRevocation()
      ? this.state.proofOfPossession === undefined
      : this.state.proofOfPossession !== undefined;
  }

  private getUnsignedPrimitives(): object {
    return {
      authorCredential: this.state.authorCredential?.valueOf(),
      authorizedAt: this.state.pairing?.getAuthorizedAt().valueOf(),
      identityId: this.state.identityId.valueOf(),
      operation: this.state.operation.valueOf(),
      operationId: this.state.operationId.valueOf(),
      pairingExpiration: this.state.pairing?.getExpiration().valueOf(),
      pairingId: this.state.pairing?.getId().valueOf(),
      previousRevision: this.state.previousRevision.valueOf(),
      revision: this.getRevision().valueOf(),
      targetCredential: this.state.targetCredential.valueOf(),
      targetCredentialCommitment:
        this.getTargetCredentialCommitment().valueOf(),
    };
  }

  public authorize(signature: Signature): DeviceAuthorizationTransition {
    return new DeviceAuthorizationTransition({
      ...this.state,
      signature,
    });
  }

  public provePossession(
    proofOfPossession: Signature,
  ): DeviceAuthorizationTransition {
    assert(
      !this.isRevocation(),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return new DeviceAuthorizationTransition({
      ...this.state,
      proofOfPossession,
    });
  }

  public authorizeRecovery(
    signature: Signature,
  ): DeviceAuthorizationTransition {
    assert(this.isRecovery(), new InvalidDeviceAuthorizationTransitionError());

    return this.authorize(signature);
  }

  public withTargetCredential(
    targetCredential: DeviceCredential,
  ): DeviceAuthorizationTransition {
    return new DeviceAuthorizationTransition({
      ...this.state,
      targetCredential,
    });
  }

  public getIdentityId(): IdentityId {
    return this.state.identityId;
  }

  public getOperationId(): DeviceAuthorizationOperationId {
    return this.state.operationId;
  }

  public getPreviousRevision(): DeviceAuthorizationRevision {
    return this.state.previousRevision;
  }

  public getRevision(): DeviceAuthorizationRevision {
    return this.state.previousRevision.next();
  }

  public getOperation(): DeviceAuthorizationOperation {
    return this.state.operation;
  }

  public getAuthorCredential(): DeviceCredential {
    assert(
      this.state.authorCredential !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.state.authorCredential;
  }

  public getTargetCredential(): DeviceCredential {
    return this.state.targetCredential;
  }

  public getTargetCredentialCommitment(): DeviceCredentialCommitment {
    return this.state.targetCredential.getCommitment();
  }

  public getPairingId(): PairingId {
    assert(
      this.state.pairing !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.state.pairing.getId();
  }

  public getPairingExpiration(): PairingExpiration {
    assert(
      this.state.pairing !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.state.pairing.getExpiration();
  }

  public getSignature(): Signature {
    assert(
      this.state.signature !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.state.signature;
  }

  public getProofOfPossession(): Signature {
    assert(
      this.state.proofOfPossession !== undefined,
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.state.proofOfPossession;
  }

  public isEnrollment(): boolean {
    return this.state.operation.isEnrollment();
  }

  public isRevocation(): boolean {
    return this.state.operation.isRevocation();
  }

  public isRecovery(): boolean {
    return this.state.operation.isRecovery();
  }

  public getSigningPayload(): DeviceAuthorizationPayload {
    return new DeviceAuthorizationPayload(
      JSON.stringify({
        domain: DeviceAuthorizationTransition.SIGNATURE_DOMAIN,
        proofOfPossession: this.state.proofOfPossession?.valueOf(),
        transition: this.getUnsignedPrimitives(),
      }),
    );
  }

  public getProofOfPossessionPayload(): DeviceAuthorizationPayload {
    return new DeviceAuthorizationPayload(
      JSON.stringify({
        domain: DeviceAuthorizationTransition.PROOF_DOMAIN,
        transition: this.getUnsignedPrimitives(),
      }),
    );
  }

  public toPrimitives(): DeviceAuthorizationTransitionPrimitives {
    return {
      authorCredential: this.state.authorCredential?.valueOf(),
      authorizedAt: this.state.pairing?.getAuthorizedAt().valueOf(),
      identityId: this.state.identityId.valueOf(),
      operation: this.state.operation.valueOf(),
      operationId: this.state.operationId.valueOf(),
      pairingExpiration: this.state.pairing?.getExpiration().valueOf(),
      pairingId: this.state.pairing?.getId().valueOf(),
      previousRevision: this.state.previousRevision.valueOf(),
      proofOfPossession: this.state.proofOfPossession?.valueOf(),
      revision: this.getRevision().valueOf(),
      signature: this.getSignature().valueOf(),
      targetCredential: this.state.targetCredential.valueOf(),
      targetCredentialCommitment:
        this.getTargetCredentialCommitment().valueOf(),
    };
  }
}
