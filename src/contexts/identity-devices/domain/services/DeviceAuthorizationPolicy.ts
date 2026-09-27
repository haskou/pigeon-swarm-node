import { assert } from '@haskou/value-objects';

import { DeviceAuthorization } from '../DeviceAuthorization';
import { DeviceAuthorizationTransition } from '../DeviceAuthorizationTransition';
import { InvalidDeviceAuthorizationTransitionError } from '../errors/InvalidDeviceAuthorizationTransitionError';

export default class DeviceAuthorizationPolicy {
  private verifyCommon(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): void {
    assert(
      authorization.getIdentityId().isEqual(transition.getIdentityId()),
      new InvalidDeviceAuthorizationTransitionError(),
    );
    assert(
      authorization.getRevision().isEqual(transition.getPreviousRevision()) &&
        transition
          .getRevision()
          .immediatelyFollows(authorization.getRevision()),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private verifyTargetProof(transition: DeviceAuthorizationTransition): void {
    assert(
      transition
        .getTargetCredential()
        .isValidSignature(
          transition.getProofOfPossessionPayload(),
          transition.getProofOfPossession(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private verifyDeviceAuthor(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): void {
    const author = transition.getAuthorCredential();

    assert(
      authorization.isAuthorized(author) &&
        author.isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );
  }

  private enroll(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyDeviceAuthor(authorization, transition);
    this.verifyTargetProof(transition);
    transition.getPairingId();
    transition.getPairingExpiration();

    return authorization.enroll(transition.getTargetCredential());
  }

  private revoke(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyDeviceAuthor(authorization, transition);

    return authorization.revoke(transition.getTargetCredential());
  }

  private recover(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyTargetProof(transition);
    assert(
      authorization
        .getRecoveryAuthority()
        .isValidSignature(
          transition.getSigningPayload(),
          transition.getSignature(),
        ),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return authorization.recover(transition.getTargetCredential());
  }

  public apply(
    authorization: DeviceAuthorization,
    transition: DeviceAuthorizationTransition,
  ): DeviceAuthorization {
    this.verifyCommon(authorization, transition);

    if (transition.isEnrollment()) {
      return this.enroll(authorization, transition);
    }

    if (transition.isRevocation()) {
      return this.revoke(authorization, transition);
    }

    assert(
      transition.isRecovery(),
      new InvalidDeviceAuthorizationTransitionError(),
    );

    return this.recover(authorization, transition);
  }
}
