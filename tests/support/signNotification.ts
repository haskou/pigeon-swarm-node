import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';
import { randomBytes } from 'node:crypto';

export interface NotificationSigner {
  deviceCredential: string;
  deviceKeyPair: KeyPair;
  id: string;
}

export interface InvitationInput {
  encryptedKey: string;
  nonce: string;
  recipientIdentityId: string;
  signer: NotificationSigner;
  subjectId: string;
  type:
    | 'community_invitation'
    | 'conversation_invitation'
    | 'group_conversation_invitation';
}

/** Signs any record as a `notifications` put, even one the policy must refuse. */
export function signNotificationRecord(
  payload: { id: string } & Record<string, unknown>,
  signer: NotificationSigner,
  sequence = 0,
  predecessor: string | null = null,
): PublicMutationProof {
  const body = {
    author: {
      authorizationRevision: 0,
      deviceCredential: signer.deviceCredential,
      identityId: signer.id,
    },
    kind: 'put',
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor,
    recordId: payload.id,
    sequence,
    store: 'notifications',
    version: 2,
  } as const;

  return PublicMutationProof.signed(
    body,
    signer.deviceKeyPair.sign(PublicMutationProof.signingContentOf(body)),
  );
}

export function invitationPayload(
  input: InvitationInput,
): Record<string, unknown> & { id: string } {
  return {
    encryptedKey: input.encryptedKey,
    id: NotificationId.invitation(
      input.signer.id,
      input.recipientIdentityId,
      input.subjectId,
      input.nonce,
    ).valueOf(),
    inviterIdentityId: input.signer.id,
    nonce: input.nonce,
    recipientIdentityId: input.recipientIdentityId,
    scopeType: 'notification_invitation',
    subjectId: input.subjectId,
    type: input.type,
  };
}

export function signNotificationInvitation(input: InvitationInput): {
  body: Record<string, unknown> & { mutation: Record<string, unknown> };
  payload: Record<string, unknown> & { id: string };
  proof: PublicMutationProof;
} {
  const payload = invitationPayload(input);
  const proof = signNotificationRecord(payload, input.signer);

  return {
    body: {
      encryptedKey: input.encryptedKey,
      mutation: proof.toPrimitives() as unknown as Record<string, unknown>,
      nonce: input.nonce,
      recipientIdentityId: input.recipientIdentityId,
      subjectId: input.subjectId,
      type: input.type,
    },
    payload,
    proof,
  };
}

export function statePayload(
  notificationId: string,
  recipientIdentityId: string,
  state: string,
  read: boolean,
): Record<string, unknown> & { id: string } {
  return {
    id: `notification-state:${notificationId}:${state}`,
    notificationId,
    read,
    recipientIdentityId,
    scopeType: 'notification_state',
    state,
  };
}

export function signNotificationState(input: {
  notificationId: string;
  predecessor?: PublicMutationProof;
  read: boolean;
  signer: NotificationSigner;
  state: string;
}): {
  payload: Record<string, unknown> & { id: string };
  proof: PublicMutationProof;
} {
  const payload = statePayload(
    input.notificationId,
    input.signer.id,
    input.state,
    input.read,
  );
  const previous = input.predecessor?.toPrimitives() as
    { sequence: number } | undefined;
  const proof = signNotificationRecord(
    payload,
    input.signer,
    previous ? previous.sequence + 1 : 0,
    input.predecessor ? input.predecessor.digest() : null,
  );

  return { payload, proof };
}
