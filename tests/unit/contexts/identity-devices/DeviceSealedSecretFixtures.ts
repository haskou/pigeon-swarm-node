import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import {
  DeviceSealedSecretBundle,
  DeviceSealedSecretBundlePrimitives,
  DeviceSealedSecretEntryPrimitives,
} from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';

export const SEALED_SECRET =
  'v2.x25519-hkdf-sha256-aes-256-gcm.ZXBo.aXY.Y3Q.dGFn';

export interface SingleDeviceFixture {
  authorization: DeviceAuthorization;
  identityId: string;
  owner: KeyPair;
}

export interface EnrolledDeviceFixture extends SingleDeviceFixture {
  candidate: KeyPair;
}

export interface SealInput {
  authorizationRevision: number;
  generation: number;
  identityId: string;
  publisher: KeyPair;
  recipient: KeyPair;
  sealedSecret?: string;
}

export function credentialOf(pair: KeyPair): string {
  return new IdentityId(pair.toPrimitives().publicKey).valueOf();
}

export async function singleDeviceFixture(): Promise<SingleDeviceFixture> {
  const owner = await KeyPair.generate();
  const identityId = new IdentityId(
    (await KeyPair.generate()).toPrimitives().publicKey,
  );
  const authorization = DeviceAuthorization.genesis(
    identityId,
    [new NetworkId('550e8400-e29b-41d4-a716-446655440000')],
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    RecoveryAuthority.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    ),
  );

  return { authorization, identityId: identityId.valueOf(), owner };
}

export async function enrolledDeviceFixture(): Promise<EnrolledDeviceFixture> {
  const base = await singleDeviceFixture();
  const candidate = await KeyPair.generate();
  const unsigned = DeviceAuthorizationTransition.enrollment(
    new IdentityId(base.identityId),
    DeviceAuthorizationOperationId.generate(),
    DeviceAuthorizationRevision.initial(),
    DeviceCredential.fromString(base.owner.toPrimitives().publicKey),
    DeviceCredential.fromString(candidate.toPrimitives().publicKey),
    new PairingAuthorization(
      PairingId.generate(),
      new PairingExpiration(Timestamp.now().valueOf() + 60_000),
      Timestamp.now(),
    ),
  );
  const proven = unsigned.provePossession(
    candidate.sign(unsigned.getProofOfPossessionPayload()),
  );
  const transition = proven.authorize(
    base.owner.sign(proven.getSigningPayload()),
  );
  const authorization = new DeviceAuthorizationPolicy().apply(
    base.authorization,
    DeviceAuthorizationTransition.fromPrimitives(transition.toPrimitives()),
  );

  return { ...base, authorization, candidate };
}

export function sealedEntry(
  input: SealInput,
): DeviceSealedSecretEntryPrimitives {
  const payload = DeviceSealedSecretBundle.signingPayload({
    authorizationRevision: input.authorizationRevision,
    generation: input.generation,
    identityId: input.identityId,
    publisherCredential: credentialOf(input.publisher),
    recipientCredential: credentialOf(input.recipient),
    sealedSecret: input.sealedSecret ?? SEALED_SECRET,
  });

  return {
    recipientCredential: credentialOf(input.recipient),
    sealedSecret: input.sealedSecret ?? SEALED_SECRET,
    signature: input.publisher.sign(payload).valueOf(),
  };
}

export function bundleOf(
  input: Partial<DeviceSealedSecretBundlePrimitives> & {
    identityId: string;
    publisher: KeyPair;
  },
): DeviceSealedSecretBundle {
  return DeviceSealedSecretBundle.fromPrimitives({
    authorizationRevision: 0,
    entries: [],
    generation: 1,
    publisherCredential: credentialOf(input.publisher),
    ...input,
  });
}
