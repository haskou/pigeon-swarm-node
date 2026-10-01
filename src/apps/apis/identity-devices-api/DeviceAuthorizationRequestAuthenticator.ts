import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { assert } from '@haskou/value-objects';
import { Request } from 'express';

import { InvalidSignedRequestError } from '../shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '../shared/SignedHttpRequestVerifier';

export class DeviceAuthorizationRequestAuthenticator {
  private readonly verifier = new SignedHttpRequestVerifier();

  private authenticateDevice(
    credentialValue: string | undefined,
    signatureValue: string | undefined,
    payload: string,
    authorization: DeviceAuthorization,
  ): void {
    assert(
      credentialValue !== undefined &&
        credentialValue.length > 0 &&
        signatureValue !== undefined &&
        signatureValue.length > 0,
      new InvalidSignedRequestError(),
    );
    const credential = DeviceCredential.fromIdentityId(
      new IdentityId(credentialValue),
    );
    const hasValidSignature = credential.isValidSignature(
      payload,
      new Signature(signatureValue),
    );
    assert(
      hasValidSignature && authorization.isAuthorized(credential),
      new InvalidSignedRequestError(),
    );
  }

  public authenticate(
    request: Request,
    authorization: DeviceAuthorization,
  ): void {
    const credentialValue = request.header('x-device-credential');
    const deviceSignatureValue = request.header('x-device-signature');
    const recoverySignatureValue = request.header('x-recovery-signature');
    const hasDeviceProof =
      credentialValue !== undefined || deviceSignatureValue !== undefined;
    const hasRecoveryProof = recoverySignatureValue !== undefined;

    try {
      assert(
        hasDeviceProof !== hasRecoveryProof,
        new InvalidSignedRequestError(),
      );
      const timestamp = this.verifier.getRequiredHeader(request, 'x-timestamp');
      const payload = JSON.stringify(
        this.verifier.getCanonicalPayload(
          request.method,
          request.path,
          timestamp,
          request.body,
        ),
      );

      if (hasRecoveryProof) {
        assert(
          recoverySignatureValue.length > 0 &&
            authorization
              .getRecoveryAuthority()
              .isValidSignature(payload, new Signature(recoverySignatureValue)),
          new InvalidSignedRequestError(),
        );

        return;
      }

      this.authenticateDevice(
        credentialValue,
        deviceSignatureValue,
        payload,
        authorization,
      );
    } catch {
      throw new InvalidSignedRequestError();
    }
  }
}
