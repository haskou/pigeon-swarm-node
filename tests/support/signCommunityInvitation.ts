import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  CommunityInvitationConsent,
  CommunityInvitationFields,
  CommunityInvitationKey,
  PrivateKey,
} from '@haskou/pigeon-swarm-crypto';
import { randomBytes } from 'node:crypto';

import { CommunityOperationSigner } from './signCommunityOperation';

export interface CommunityInvitationProofs {
  consent: string;
  possession: string;
}

export interface SignedCommunityInvitationClaim {
  claim: CommunityInvitationClaim;
  proof: PublicMutationProof;
}

/** The fields a joiner's possession and consent proofs sign. */
export function invitationFieldsOf(
  communityId: string,
  invitationId: string,
  joinerId: string,
  networkId: string,
): CommunityInvitationFields {
  return { communityId, identityId: joinerId, invitationId, networkId };
}

/** The possession proof by the link key and the consent of `joiner`. */
export function signInvitationProofs(
  key: CommunityInvitationKey,
  joiner: CommunityOperationSigner,
  fields: CommunityInvitationFields,
): CommunityInvitationProofs {
  return {
    consent: CommunityInvitationConsent.sign(
      fields,
      new PrivateKey(joiner.identityKeyPair.toPrimitives().privateKey),
    ),
    possession: key.signPossession(fields),
  };
}

/**
 * A claim the way a client signs it: a `requests` put by the joiner whose
 * proof binds the frontier the joiner read the invitation at. Each call has
 * its own proof, so two claims under one id differ by digest.
 */
export function signInvitationClaim(input: {
  communityId: string;
  frontier: string[];
  invitationId: string;
  joiner: CommunityOperationSigner;
  key: CommunityInvitationKey;
  networkId: string;
}): SignedCommunityInvitationClaim {
  const proofs = signInvitationProofs(
    input.key,
    input.joiner,
    invitationFieldsOf(
      input.communityId,
      input.invitationId,
      input.joiner.id,
      input.networkId,
    ),
  );
  const claim = CommunityInvitationClaim.create(
    new CommunityId(input.communityId),
    input.invitationId,
    new IdentityId(input.joiner.id),
    proofs.possession,
    proofs.consent,
  );
  const payload = {
    ...claim.toPrimitives(),
    scopeType: 'community_invitation_claim',
  };
  const body = {
    author: {
      authorizationRevision: 0,
      deviceCredential: input.joiner.deviceCredential,
      identityId: input.joiner.id,
    },
    frontier: input.frontier,
    kind: 'put',
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor: null as string | null,
    recordId: payload.id,
    sequence: 0,
    store: 'requests',
    version: 2,
  } as const;

  return {
    claim,
    proof: PublicMutationProof.signed(
      body,
      input.joiner.deviceKeyPair.sign(
        PublicMutationProof.signingContentOf(body),
      ),
    ),
  };
}
