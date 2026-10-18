import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransitionLog } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionLog';
import { DeviceAuthorizationTransitionReader } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionReader';
import { PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';
import { assert } from '@haskou/value-objects';
import { Request } from 'express';

import { InvalidSignedRequestError } from '../shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '../shared/SignedHttpRequestVerifier';
import { assertSignedRequestTimestampIsFresh } from '../shared/SignedRequestFreshness';
import { signedRequestReplayGuard } from '../shared/SignedRequestReplayGuard';

interface DeviceProof {
  credential: DeviceCredential;
  signature: Signature;
}

interface SignerProof {
  signature: Signature;
  signer: DeviceAuthorizationTransitionReader;
}

/**
 * Authenticates the device proof (`X-Device-Credential` and
 * `X-Device-Signature`) or recovery proof (`X-Recovery-Signature`) of a
 * request. Every accepted proof is fresh and used once: a signature seen
 * before inside its window is refused, keyed by the raw signing key. A proof
 * takes a slot in the replay guard only once its signer is known to be
 * authorized, so a key that was never authorized cannot fill the guard.
 */
export class DeviceAuthorizationRequestAuthenticator {
  private readonly verifier = new SignedHttpRequestVerifier();

  /** Verifies the signature and its freshness; it takes no replay slot. */
  private verifyProof(
    request: Request,
    timestamp: string,
    signatureValue: string,
    signer: PublicKey,
  ): Signature {
    const signature = this.verifier.verifyWith(
      request,
      timestamp,
      signatureValue,
      signer,
    );
    assertSignedRequestTimestampIsFresh(timestamp);

    return signature;
  }

  /** Admits a verified proof of an authorized signer only once. */
  private acceptOnce(
    request: Request,
    signer: PublicKey,
    signature: Signature,
  ): void {
    assert(
      signedRequestReplayGuard.accept(
        signer,
        signature,
        request.ip ?? 'unknown',
      ),
      new InvalidSignedRequestError(),
    );
  }

  private verifyDevice(
    request: Request,
    timestamp: string,
    credentialValue: string | undefined,
    signatureValue: string | undefined,
  ): DeviceProof {
    assert(
      credentialValue !== undefined &&
        credentialValue.length > 0 &&
        signatureValue !== undefined &&
        signatureValue.length > 0,
      new InvalidSignedRequestError(),
    );
    const credential = DeviceCredential.fromWire(credentialValue);

    return {
      credential,
      signature: this.verifyProof(
        request,
        timestamp,
        signatureValue,
        credential,
      ),
    };
  }

  /**
   * The key that signed the request: exactly one device proof or recovery
   * proof. A device proof is only checked for its signature, not against the
   * authorized set.
   */
  private signerOf(
    request: Request,
    recoveryAuthority: RecoveryAuthority,
  ): SignerProof {
    const credentialValue = request.header('x-device-credential');
    const deviceSignatureValue = request.header('x-device-signature');
    const recoverySignatureValue = request.header('x-recovery-signature');
    const hasDeviceProof =
      credentialValue !== undefined || deviceSignatureValue !== undefined;
    const hasRecoveryProof = recoverySignatureValue !== undefined;

    assert(
      hasDeviceProof !== hasRecoveryProof,
      new InvalidSignedRequestError(),
    );
    const timestamp = this.verifier.getRequiredHeader(request, 'x-timestamp');

    if (hasRecoveryProof) {
      assert(
        recoverySignatureValue.length > 0,
        new InvalidSignedRequestError(),
      );

      return {
        signature: this.verifyProof(
          request,
          timestamp,
          recoverySignatureValue,
          recoveryAuthority,
        ),
        signer: recoveryAuthority,
      };
    }

    const { credential, signature } = this.verifyDevice(
      request,
      timestamp,
      credentialValue,
      deviceSignatureValue,
    );

    return { signature, signer: credential };
  }

  public authenticate(
    request: Request,
    authorization: DeviceAuthorization,
  ): void {
    this.verifier.assertTargetWithinLimit(request);
    try {
      const { signature, signer } = this.signerOf(
        request,
        authorization.getRecoveryAuthority(),
      );
      assert(
        signer instanceof RecoveryAuthority ||
          authorization.isAuthorized(signer),
        new InvalidSignedRequestError(),
      );
      this.acceptOnce(request, signer, signature);
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  /**
   * The reader of the device-authorization transition log: the recovery
   * authority or any device that signed the request, authorized at the head
   * or not, so a removed device can still read the transition that removed
   * it. Only a reader the log records takes a replay slot; any other key reads
   * at most the public recovery lineage, so it gets no slot to fill.
   */
  public authenticateReader(
    request: Request,
    log: DeviceAuthorizationTransitionLog,
  ): DeviceAuthorizationTransitionReader {
    this.verifier.assertTargetWithinLimit(request);
    try {
      const { signature, signer } = this.signerOf(
        request,
        log.getRecoveryAuthority(),
      );

      if (log.records(signer)) {
        this.acceptOnce(request, signer, signature);
      }

      return signer;
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  public authenticateCurrentDevice(
    request: Request,
    authorization: DeviceAuthorization,
  ): DeviceCredential {
    this.verifier.assertTargetWithinLimit(request);
    try {
      assert(
        request.header('x-recovery-signature') === undefined,
        new InvalidSignedRequestError(),
      );
      const timestamp = this.verifier.getRequiredHeader(request, 'x-timestamp');
      const { credential, signature } = this.verifyDevice(
        request,
        timestamp,
        request.header('x-device-credential'),
        request.header('x-device-signature'),
      );
      assert(
        authorization.isAuthorized(credential),
        new InvalidSignedRequestError(),
      );
      this.acceptOnce(request, credential, signature);

      return credential;
    } catch {
      throw new InvalidSignedRequestError();
    }
  }
}
