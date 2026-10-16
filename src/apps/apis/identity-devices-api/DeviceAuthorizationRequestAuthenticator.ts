import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransitionReader } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransitionReader';
import { assert } from '@haskou/value-objects';
import { Request } from 'express';

import { InvalidSignedRequestError } from '../shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '../shared/SignedHttpRequestVerifier';
import { assertSignedRequestTimestampIsFresh } from '../shared/SignedRequestFreshness';

export class DeviceAuthorizationRequestAuthenticator {
  private readonly verifier = new SignedHttpRequestVerifier();

  private verifyDevice(
    request: Request,
    timestamp: string,
    credentialValue: string | undefined,
    signatureValue: string | undefined,
  ): DeviceCredential {
    assert(
      credentialValue !== undefined &&
        credentialValue.length > 0 &&
        signatureValue !== undefined &&
        signatureValue.length > 0,
      new InvalidSignedRequestError(),
    );
    const credential = DeviceCredential.fromWire(credentialValue);
    this.verifier.verifyWith(request, timestamp, signatureValue, credential);

    return credential;
  }

  /**
   * The key that signed the request: exactly one device proof or recovery
   * proof. A device proof is only checked for its signature, not against the
   * authorized set.
   */
  private signerOf(
    request: Request,
    authorization: DeviceAuthorization,
  ): DeviceAuthorizationTransitionReader {
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
      const recoveryAuthority = authorization.getRecoveryAuthority();
      assert(
        recoverySignatureValue.length > 0,
        new InvalidSignedRequestError(),
      );
      this.verifier.verifyWith(
        request,
        timestamp,
        recoverySignatureValue,
        recoveryAuthority,
      );

      return recoveryAuthority;
    }

    return this.verifyDevice(
      request,
      timestamp,
      credentialValue,
      deviceSignatureValue,
    );
  }

  public authenticate(
    request: Request,
    authorization: DeviceAuthorization,
  ): void {
    try {
      const signer = this.signerOf(request, authorization);
      assert(
        signer instanceof RecoveryAuthority ||
          authorization.isAuthorized(signer),
        new InvalidSignedRequestError(),
      );
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  /**
   * The reader of the device-authorization transition log: the recovery
   * authority or any device that signed the request, authorized at the head
   * or not, so a removed device can still read the transition that removed
   * it.
   */
  public authenticateReader(
    request: Request,
    authorization: DeviceAuthorization,
  ): DeviceAuthorizationTransitionReader {
    try {
      return this.signerOf(request, authorization);
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  public authenticateCurrentDevice(
    request: Request,
    authorization: DeviceAuthorization,
  ): DeviceCredential {
    try {
      assert(
        request.header('x-recovery-signature') === undefined,
        new InvalidSignedRequestError(),
      );
      const timestamp = this.verifier.getRequiredHeader(request, 'x-timestamp');
      assertSignedRequestTimestampIsFresh(timestamp);
      const credential = this.verifyDevice(
        request,
        timestamp,
        request.header('x-device-credential'),
        request.header('x-device-signature'),
      );
      assert(
        authorization.isAuthorized(credential),
        new InvalidSignedRequestError(),
      );

      return credential;
    } catch {
      throw new InvalidSignedRequestError();
    }
  }
}
