import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import IdentityAdmissionSourceRateLimiter from '@app/apps/apis/identities-api/IdentityAdmissionSourceRateLimiter';
import { PrivateAuthorizationRequestBodyLimit } from '@app/apps/apis/private-authorization-api/routes/PrivateAuthorizationRequestBodyLimit';
import IdentityMutationGateInitializer from '@app/apps/initializers/identities/IdentityMutationGateInitializer';
import NonCanonicalIdentityIdsPurgeInitializer from '@app/apps/initializers/nodes/NonCanonicalIdentityIdsPurgeInitializer';
import PigeonApplication from '@app/apps/PigeonApplication';
import OrbitDBCallProjectionRuntime from '@app/apps/runtimes/orbitdb-call-projection-runtime/OrbitDBCallProjectionRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import CallParticipantLeaseExpirationRegistrar from '@app/contexts/calls/application/expire-participant-leases/CallParticipantLeaseExpirationRegistrar';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import ConversationRepository from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { Identity } from '@app/contexts/identities/domain/Identity';
import { IdentityPrimitives } from '@app/contexts/identities/domain/IdentityPrimitives';
import IdentityAdmissionLoadRepository from '@app/contexts/identities/domain/repositories/IdentityAdmissionLoadRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import IpfsIdentityMapper from '@app/contexts/identities/infrastructure/ipfs/mappers/IpfsIdentityMapper';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceSealedSecretBundle } from '@app/contexts/identity-devices/domain/DeviceSealedSecretBundle';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { MailboxCreationDifficulty } from '@app/contexts/mailboxes/domain/MailboxCreationDifficulty';
import { MailboxCreationProof } from '@app/contexts/mailboxes/domain/MailboxCreationProof';
import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import NodeOwnerSettingsResetter from '@app/contexts/nodes/application/reset-owner-settings/NodeOwnerSettingsResetter';
import { NodeBlockEntries } from '@app/contexts/nodes/domain/NodeBlockEntries';
import { NodeBlockList } from '@app/contexts/nodes/domain/NodeBlockList';
import { NodeBlockSource } from '@app/contexts/nodes/domain/NodeBlockSource';
import NodeBlockExceptionsRepository from '@app/contexts/nodes/domain/repositories/NodeBlockExceptionsRepository';
import NodeBlockListRepository from '@app/contexts/nodes/domain/repositories/NodeBlockListRepository';
import NodeBlockSourceRepository from '@app/contexts/nodes/domain/repositories/NodeBlockSourceRepository';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import { SignedNodeBlockList } from '@app/contexts/nodes/domain/SignedNodeBlockList';
import { NodeBlockSourceOrigin } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceOrigin';
import { NodeBlockSourceVersionFloor } from '@app/contexts/nodes/domain/value-objects/NodeBlockSourceVersionFloor';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import Ed25519PrivateDeviceCredentialCodec from '@app/contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { DataTable, setDefaultTimeout } from '@cucumber/cucumber';
import { Kernel } from '@haskou/ddd-kernel';
import {
  CommitmentId,
  CommunityInvitationConsent,
  CommunityInvitationFields,
  CommunityInvitationKey,
  IdentitySignature,
  KeychainSignature,
  KeyPair,
  PrivateGenesisSignature,
  PrivateKey,
  Signature,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { Timestamp, assert } from '@haskou/value-objects';
import canonicalize from 'canonicalize';
import { expect } from 'chai';
import * as chai from 'chai';
import chaiSubset from 'chai-subset';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'crypto';
import { after, before, binding, given, then, when } from 'cucumber-tsflow';
import FormData from 'form-data';

import { legacyGroupGenesis } from '../../support/legacyGroupGenesis';
import { mineAdmissionNonce } from '../../support/mineAdmissionNonce';
import {
  CallParticipantState,
  CallSigner,
  mutationOf,
  participantPayload,
  signCallEnd,
  signCallParticipant,
  signCallStart,
} from '../../support/signCall';
import { signCommunityOperation } from '../../support/signCommunityOperation';
import {
  signConversationOperation,
  signConversationOperationRecord,
} from '../../support/signConversationOperation';
import {
  signNotificationInvitation,
  signNotificationState,
} from '../../support/signNotification';
import { IdentityIdMother } from '../../unit/mothers/IdentityIdMother';
import IPFSDefinition from './IPFSDefinition';
import RestClient from './RestClient';
import { RestResponse } from './RestResponse';

chai.use(chaiSubset);

setDefaultTimeout(20_000);

// Every scenario awaits the same startup, so a failed startup (for example
// API_PORT held by another run) fails each scenario with its cause instead of
// later scenarios sending requests to whatever process owns the port.
let application: Promise<PigeonApplication> | null = null;

async function startApplication(
  ipfsDefinition: IPFSDefinition,
): Promise<PigeonApplication> {
  const started = new PigeonApplication();

  // Each scenario's client sends its own forwarded address (see RestClient),
  // so per-address limits such as the replay guard's stranger cap count one
  // scenario at a time, as they would count one client.
  // The server reads the setting once, when it starts, so it is put back
  // afterwards.
  const trustProxy = process.env.API_TRUST_PROXY;

  process.env.API_TRUST_PROXY = 'loopback';
  started.loadEnvironmentVariables('test');
  ipfsDefinition.cleanupStorageFolder(process.env.IPFS_STORAGE_PATH);

  await started.dependencyInjection();
  // Production boot runs this initializer before the server starts. Without it
  // the harness would admit records production refuses, e.g. replicated
  // identity records under an alias id.
  await started.runInitializers(IdentityMutationGateInitializer);

  try {
    await started.runServer();
  } finally {
    if (trustProxy === undefined) {
      delete process.env.API_TRUST_PROXY;
    } else {
      process.env.API_TRUST_PROXY = trustProxy;
    }
  }

  started.logs();
  await started.runRuntimes(
    OrbitDBReplicatedStateRuntime,
    OrbitDBCallProjectionRuntime,
  );

  return started;
}

type StickerPackDocument = Record<string, unknown> & {
  stickers: Record<string, unknown>[];
};

/** What group members would derive from the MLS exporter of the group epoch. */
const GROUP_CALL_CAPABILITY = 'Zm9yLXRoZS1ncm91cC1jYWxsLW9ubHktMzItYnl0ZXM';

@binding()
export default class Definitions {
  private admissionProofBits: number | undefined;
  private identitySignedOffsetMs = 0;
  private signedRequestOffsetMs = 0;
  private binaryBody: Buffer | undefined;
  private readonly notificationSettingsSequences = new Map<string, number>();
  private readonly communityRecordSequences = new Map<string, number>();
  private communityChannelType: 'text' | 'voice' = 'text';
  private communityMembershipRequest: Record<string, unknown> | undefined;
  private replicationCid = '';
  private readonly stickerMutationSequences = new Map<string, number>();
  private readonly stickerPackDocuments = new Map<
    string,
    StickerPackDocument
  >();

  private stickerClock = 1_780_000_000_000;
  private body: string | undefined;
  private callId: string | undefined;
  private callMutationDisabled = false;
  private readonly callJoined = new Set<string>();
  private readonly callProofs = new Map<string, PublicMutationProof>();
  private communityChannelId: string | undefined;
  private communityChannelMessageId: string | undefined;
  private communityPinCount = 0;
  private communityDraftCount = 0;
  private pageNextCursor: string | undefined;
  private readonly pageCursors = new Map<string, string>();
  private communityThreadRootMessageId: string | undefined;
  private communityMessageCreatedAt = 0;
  private communityId: string | undefined;
  private communityInvitationId: string | undefined;
  private communityInvitationKey: CommunityInvitationKey | undefined;
  private communityInvitationProofs:
    { consent: string; possession: string } | undefined;

  private lastCommunityOperationHash: string | undefined;
  private communityMembershipRequestId: string | undefined;
  private communityRoleId: string | undefined;
  private concurrentCallResponses: RestResponse[] = [];
  private concurrentResponses: RestResponse[] = [];
  private formData: FormData | undefined;
  private headers: Record<string, string> = {};
  private identityKeyPair: KeyPair | undefined;
  private identityDeviceOwnerKeyPair: KeyPair | undefined;
  private identityRecoveryKeyPair: KeyPair | undefined;
  private identityDeviceTargetKeyPair: KeyPair | undefined;
  private signedDeviceAuthorizationTransitions: string[] = [];

  private signedConversationRequest:
    { method: string; path: string } | undefined;

  private conversationId: string | undefined;
  private currentNetworkId: string | undefined;
  private createdIdentityId: string | undefined;
  private registrationCode: { code: string; id: string } | undefined;
  private keychainExternalIdentifier: string | undefined;
  private messageId: string | undefined;
  private notificationId: string | undefined;
  private createdNotificationIds: string[] = [];
  private privateAuthorizationScopeId: string | undefined;
  private otherIdentityId: IdentityId | undefined;
  private otherIdentityKeyPair: KeyPair | undefined;
  private publishedGenesisExternalIdentifier: string | undefined;
  private readonly replayAnswers: { data: unknown; status: number }[] = [];
  private blockSourcePublisherKeyPair: KeyPair | undefined;
  private blockSourcePublisherEncoding: string | undefined;
  private rememberedCallJoinRequest:
    { body: string | undefined; headers: Record<string, string> } | undefined;

  private rememberedDiagnosticsRequest:
    { body: string | undefined; headers: Record<string, string> } | undefined;

  private rememberedDiagnosticsOpenedAt: number | undefined;

  private ownerIdentityId: IdentityId | undefined;
  private privateBlob:
    { blobId: string; downloadToken: string; uploadToken: string } | undefined;

  private response: RestResponse = null;
  private restClient: RestClient = new RestClient();
  private readonly ipfsDefinition: IPFSDefinition = new IPFSDefinition();
  private stickerPackId: string | undefined;
  private stickerId: string | undefined;

  private async ensureIdentityKeyPair(): Promise<KeyPair> {
    if (!this.identityKeyPair) {
      this.identityKeyPair = await KeyPair.generate();
      this.ownerIdentityId = new IdentityId(
        this.identityKeyPair.toPrimitives().publicKey,
      );
    }

    return this.identityKeyPair;
  }

  private async ensureOtherIdentityKeyPair(): Promise<KeyPair> {
    if (!this.otherIdentityKeyPair) {
      this.otherIdentityKeyPair = await KeyPair.generate();
      this.otherIdentityId = new IdentityId(
        this.otherIdentityKeyPair.toPrimitives().publicKey,
      );
    }

    return this.otherIdentityKeyPair;
  }

  /** The path of the identity the current key pair signs for, whether or not the node holds it. */
  private async currentIdentityPath(): Promise<string> {
    await this.ensureIdentityKeyPair();
    const identityId = this.ownerIdentityId as IdentityId;

    return `/identities/${encodeURIComponent(identityId.valueOf())}`;
  }

  private async ensureIdentityDeviceOwnerKeyPair(): Promise<KeyPair> {
    this.identityDeviceOwnerKeyPair ??= await KeyPair.generate();

    return this.identityDeviceOwnerKeyPair;
  }

  private async ensureIdentityRecoveryKeyPair(): Promise<KeyPair> {
    this.identityRecoveryKeyPair ??= await KeyPair.generate();

    return this.identityRecoveryKeyPair;
  }

  private async waitForReplicatedState(): Promise<void> {
    const registry = Kernel.di.getService<OrbitDBReplicatedStateRegistry>(
      OrbitDBReplicatedStateRegistry,
    );
    const deadline = Date.now() + 5_000;

    while (Date.now() < deadline) {
      try {
        await registry.findHead('api-test-readiness');

        return;
      } catch (error: unknown) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined;

        if (code !== ReplicatedStateNotReadyError.CODE) {
          throw error;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('Replicated state did not become ready for the API test.');
  }

  private async buildClientSignedIdentityBody(
    name: string,
    handle: string,
    version: number = 1,
    previousIdentityExternalIdentifier: string | undefined = undefined,
    identityId: IdentityId | undefined = undefined,
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const recoveryKeyPair = await this.ensureIdentityRecoveryKeyPair();
    const ownerIdentityId = identityId ?? (this.ownerIdentityId as IdentityId);
    const deviceCredential = DeviceCredential.fromString(
      (await this.ensureIdentityDeviceOwnerKeyPair()).toPrimitives().publicKey,
    );
    const networks = [
      this.currentNetworkId ?? '123e4567-e89b-12d3-a456-426614174000',
    ];
    const normalizedHandle = handle.replace(/^@/, '').toLowerCase();
    const profile: {
      banner: string | undefined;
      biography: string | undefined;
      handle: string;
      name: string;
      picture: string | undefined;
    } = {
      banner: undefined,
      biography: undefined,
      handle: normalizedHandle,
      name,
      picture: undefined,
    };
    const signaturePayload = {
      admissionNonce: mineAdmissionNonce(
        ownerIdentityId.valueOf(),
        networks,
        this.admissionProofBits,
      ),
      authorizationRevision: 0,
      deviceCredential: deviceCredential.valueOf(),
      deviceCredentialCommitment: deviceCredential.getCommitment().valueOf(),
      id: ownerIdentityId.valueOf(),
      networks,
      previousIdentityExternalIdentifier,
      profile,
      recoveryAuthority: recoveryKeyPair.toPrimitives().publicKey,
      timestamp: Date.now() + this.identitySignedOffsetMs + version,
      version,
    };
    const signature = keyPair
      .sign(IdentitySignature.signingContent(signaturePayload))
      .valueOf();

    this.body = JSON.stringify({
      ...signaturePayload,
      signature,
    });
  }

  private async ensureAuthenticatedIdentityIsPublished(): Promise<void> {
    const previousBinaryBody = this.binaryBody;
    const previousBody = this.body;
    const previousHeaders = { ...this.headers };
    const ownerIdentityId =
      this.ownerIdentityId ??
      new IdentityId(
        (await this.ensureIdentityKeyPair()).toPrimitives().publicKey,
      );

    if (this.createdIdentityId === ownerIdentityId.valueOf()) {
      return;
    }

    this.binaryBody = undefined;
    this.headers = {};

    try {
      await this.buildClientSignedIdentityBody(
        'Test Identity',
        'test-identity',
      );
      await this.signCurrentRequest('POST', '/identities');

      const response = await this.restClient.post(
        '/identities',
        JSON.parse(this.body || '{}'),
        { headers: this.headers },
      );

      if (response.status !== 200) {
        throw new Error(
          `Could not publish identity: ${JSON.stringify(response.data)}`,
        );
      }

      this.createdIdentityId = response.data.id;
    } finally {
      this.binaryBody = previousBinaryBody;
      this.body = previousBody;
      this.headers = previousHeaders;
    }
  }

  private async findCreatedIdentityExternalIdentifier(): Promise<string> {
    if (!this.createdIdentityId) {
      throw new Error('Identity must be created first.');
    }

    const ipfs = Kernel.di.getService<IPFS>(IPFS);
    const externalIdentifier = await ipfs.getRecord(
      `pigeon-swarm_identity-${this.createdIdentityId}`,
    );

    if (!externalIdentifier) {
      throw new Error('Created identity external identifier not found.');
    }

    return externalIdentifier;
  }

  private async resolveSignerKeyPair(
    keyPair: KeyPair | undefined,
  ): Promise<KeyPair> {
    return keyPair ?? (await this.ensureIdentityKeyPair());
  }

  private resolveSignerIdentityId(
    identityId: IdentityId | undefined,
  ): IdentityId | undefined {
    return identityId ?? this.ownerIdentityId;
  }

  private aliasOf(identityId: IdentityId, encoding: string): IdentityId {
    const aliasOf = new Map(IdentityIdMother.aliases()).get(encoding);

    if (!aliasOf) {
      throw new Error(`Unknown identity id encoding: ${encoding}`);
    }

    return aliasOf(identityId);
  }

  private getCurrentRequestBody(): SignedHttpRequestBody {
    if (this.binaryBody) {
      return this.binaryBody;
    }

    return this.body ? JSON.parse(this.body) : {};
  }

  private getPostBody(): unknown {
    if (this.formData) {
      return this.formData;
    }

    return this.binaryBody ?? (this.body ? JSON.parse(this.body) : undefined);
  }

  private getPostHeaders(): Record<string, string> {
    return this.formData?.getHeaders() || this.headers;
  }

  private rememberCreatedIdentityFromResponse(): void {
    const identityId = this.response?.data?.id;

    if (identityId) {
      this.createdIdentityId = identityId;
    }
  }

  private signCommunityRecord(
    payload: Record<string, unknown>,
    keyPair: KeyPair,
    sequence?: number,
    store = 'requests',
    frontier?: string[],
  ): Record<string, unknown> {
    const recordId = String(payload.id);
    const next = sequence ?? this.communityRecordSequences.get(recordId) ?? 0;
    const identityId = keyPair.toPrimitives().publicKey;
    const proofBody = {
      author: {
        authorizationRevision: 0,
        deviceCredential: identityId,
        identityId,
      },
      ...(frontier ? { frontier } : {}),
      kind: 'put',
      operationId: `api-community-${next}-${recordId}`
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 22)
        .padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        next === 0 ? null : PublicMutationProof.digestOf({ previous: next }),
      recordId,
      sequence: next,
      store,
      version: 2,
    } as const;

    if (sequence === undefined) {
      this.communityRecordSequences.set(recordId, next + 1);
    }

    return PublicMutationProof.signed(
      proofBody,
      keyPair.sign(PublicMutationProof.signingContentOf(proofBody)),
    ).toPrimitives() as unknown as Record<string, unknown>;
  }

  private communityRequestPayload(
    creatorIdentityId: string,
    identityId: string,
    createdAt: number,
  ): Record<string, unknown> {
    const communityId = String(this.communityId);

    return {
      communityId,
      createdAt,
      creatorIdentityId,
      id: CommitmentId.communityRequest(
        communityId,
        'request',
        creatorIdentityId,
        identityId,
        createdAt,
      ),
      identityId,
      scopeType: 'community_membership_request',
      status: 'pending',
      type: 'request',
      updatedAt: createdAt,
    };
  }

  private async signMembershipRequestUpdate(
    keyPair: KeyPair,
    identityId?: IdentityId,
  ): Promise<void> {
    const request = this.communityMembershipRequest;

    if (!request || !this.communityMembershipRequestId) {
      throw new Error('Community membership request must be created first.');
    }

    const body = JSON.parse(this.body ?? '{}');
    const updatedAt = Math.max(Date.now(), Number(request.updatedAt) + 1);
    const payload = {
      communityId: request.communityId,
      createdAt: request.createdAt,
      creatorIdentityId: request.creatorIdentityId,
      id: request.id,
      identityId: request.identityId,
      scopeType: 'community_membership_request',
      status: body.status,
      type: request.type,
      updatedAt,
    };

    this.body = JSON.stringify({
      ...body,
      mutation: this.signCommunityRecord(payload, keyPair),
      updatedAt,
    });
    await this.signCurrentRequest(
      'PATCH',
      `/community-membership-requests/${this.communityMembershipRequestId}`,
      String(Date.now()),
      keyPair,
      identityId,
    );
  }

  private communityModerationLogFor(
    method: string,
    path: string,
    body: Record<string, unknown>,
    actorIdentityId: string,
    createdAt: number,
  ):
    | {
        action: string;
        details: Record<string, unknown>;
        target: { id: string; type: string };
      }
    | undefined {
    type Log = {
      action: string;
      details: Record<string, unknown>;
      target: { id: string; type: string };
    };
    const communityId = String(this.communityId);
    const text = body as Record<string, string>;
    const channelId = String(this.communityChannelId);
    const roleId = String(this.communityRoleId);
    const channel = (id: string) => ({ id, type: 'channel' });
    const role = (id: string) => ({ id, type: 'role' });
    const member = (id: string) => ({ id, type: 'member' });
    const derivedChannelId = CommunityChannelId.derive(
      communityId,
      actorIdentityId,
      createdAt,
    ).valueOf();
    const derivedRoleId = CommunityRoleId.derive(
      communityId,
      actorIdentityId,
      createdAt,
    ).valueOf();
    const rules: [string, RegExp, (match: RegExpExecArray) => Log][] = [
      [
        'POST',
        /^\/communities\/[^/]+\/invitations$/,
        () => ({
          action: 'invitation_created',
          details: { expiresAt: body.expiresAt, maxUses: body.maxUses },
          target: {
            id: String(this.lastCommunityOperationHash),
            type: 'invitation',
          },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/invitations\/([^/]+)\/revocation$/,
        (match) => ({
          action: 'invitation_revoked',
          details: {},
          target: { id: decodeURIComponent(match[1]), type: 'invitation' },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/channels$/,
        () => ({
          action: 'channel_created',
          details: { name: body.name, type: body.type },
          target: channel(derivedChannelId),
        }),
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+\/channels\/[^/]+$/,
        () => ({
          action: 'channel_renamed',
          details: { name: body.name },
          target: channel(channelId),
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/channels\/[^/]+$/,
        () => ({
          action: 'channel_deleted',
          details: { type: this.communityChannelType },
          target: channel(channelId),
        }),
      ],
      [
        'PATCH',
        /\/channels\/[^/]+\/permissions$/,
        () => ({
          action: 'channel_permissions_updated',
          details: { visibleRoleIds: body.visibleRoleIds },
          target: channel(channelId),
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/roles$/,
        () => ({
          action: 'role_created',
          details: { name: body.name, permissions: body.permissions },
          target: role(derivedRoleId),
        }),
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+\/roles\/[^/]+$/,
        () => ({
          action: 'role_updated',
          details: { name: body.name, permissions: body.permissions },
          target: role(roleId),
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/roles\/[^/]+$/,
        () => ({
          action: 'role_deleted',
          details: {},
          target: role(roleId),
        }),
      ],
      [
        'PUT',
        /^\/communities\/[^/]+\/members\/([^/]+)\/roles$/,
        (match) => ({
          action: 'member_roles_updated',
          details: { roleIds: body.roleIds },
          target: member(decodeURIComponent(match[1])),
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/bans$/,
        () => ({
          action: 'member_banned',
          details: { reason: body.reason },
          target: member(text.identityId),
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/bans\/([^/]+)$/,
        (match) => ({
          action: 'member_unbanned',
          details: {},
          target: member(decodeURIComponent(match[1])),
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/members\/(?!me$)([^/]+)$/,
        (match) => ({
          action: 'member_kicked',
          details: {},
          target: member(decodeURIComponent(match[1])),
        }),
      ],
      [
        'PATCH',
        /^\/community-membership-requests\/[^/]+$/,
        () => {
          const request = this.communityMembershipRequest as Record<
            string,
            string
          >;

          return {
            action:
              body.status === 'accepted'
                ? 'membership_request_accepted'
                : 'membership_request_declined',
            details: { identityId: request.identityId, type: request.type },
            target: { id: request.id, type: 'membership_request' },
          };
        },
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+$/,
        () => ({
          action: 'community_updated',
          details: {
            autoJoinEnabled: body.autoJoinEnabled,
            avatar: body.avatar,
            banner: body.banner,
            description: body.description,
            discoverable: body.discoverable,
            name: body.name,
          },
          target: { id: communityId, type: 'community' },
        }),
      ],
      [
        'DELETE',
        /\/channels\/[^/]+\/messages\/[^/]+$/,
        () => ({
          action: 'message_deleted',
          details: {
            channelId: this.communityChannelId,
            targetMessageAuthorId: this.ownerIdentityId?.valueOf(),
          },
          target: {
            id: String(this.communityChannelMessageId),
            type: 'message',
          },
        }),
      ],
    ];
    const pathname = path.split('?')[0];

    for (const [ruleMethod, pattern, build] of rules) {
      const match = ruleMethod === method ? pattern.exec(pathname) : null;

      if (match) {
        return build(match);
      }
    }

    return undefined;
  }

  /** Adds the client-signed moderation log entry to a community mutation body. */
  private attachCommunityModerationLog(
    method: string,
    path: string,
    keyPair: KeyPair,
    createdAt: number,
  ): void {
    const body = JSON.parse(this.body ?? '{}');
    const actorIdentityId = keyPair.toPrimitives().publicKey;
    const entry = this.communityModerationLogFor(
      method,
      path,
      body,
      actorIdentityId,
      createdAt,
    );

    if (!entry || !this.communityId || body.moderationLog) {
      return;
    }

    const payload = JSON.parse(
      JSON.stringify({
        action: entry.action,
        actorIdentityId,
        communityId: this.communityId,
        createdAt,
        details: entry.details,
        id: CommunityModerationLogId.derive(
          this.communityId,
          actorIdentityId,
          entry.action,
          entry.target.type,
          entry.target.id,
          createdAt,
        ).valueOf(),
        scopeType: 'community_moderation_log',
        target: entry.target,
      }),
    );

    this.body = JSON.stringify({
      ...body,
      moderationLog: {
        createdAt,
        mutation: this.signCommunityRecord(
          payload,
          keyPair,
          undefined,
          'moderationLogs',
        ),
      },
    });
  }

  private communityOperationFor(
    method: string,
    path: string,
    body: Record<string, unknown>,
    actorIdentityId: string,
    createdAt: number,
  ): { action: string; args: Record<string, unknown> } | undefined {
    type Spec = { action: string; args: Record<string, unknown> };
    const communityId = String(this.communityId);
    const decoded = (match: RegExpExecArray, index = 1): string =>
      decodeURIComponent(match[index]);
    const optional = (
      values: Record<string, unknown>,
    ): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== undefined),
      );
    const rules: [
      string,
      RegExp,
      (match: RegExpExecArray) => Spec | undefined,
    ][] = [
      [
        'POST',
        /^\/communities\/[^/]+\/invitations$/,
        () => ({
          action: 'invitation_created',
          args: optional({
            expiresAt: body.expiresAt,
            invitationKey: body.invitationKey,
            invitee: body.invitee,
            maxUses: body.maxUses,
          }),
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/invitations\/([^/]+)\/revocation$/,
        (match) => ({
          action: 'invitation_revoked',
          args: { invitationId: decoded(match) },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/invitations\/([^/]+)\/admissions$/,
        (match) => ({
          action: 'member_joined',
          args: {
            consent: body.consent,
            identityId: body.identityId,
            invitationId: decoded(match),
            method: 'invitation',
            possession: body.possession,
          },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/channels$/,
        () => ({
          action: 'channel_created',
          args: {
            channelId: CommunityChannelId.derive(
              communityId,
              actorIdentityId,
              createdAt,
            ).valueOf(),
            name: body.name,
            type: body.type,
          },
        }),
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+\/channels\/([^/]+)$/,
        (match) => ({
          action: 'channel_renamed',
          args: { channelId: decoded(match), name: body.name },
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/channels\/([^/]+)$/,
        (match) => ({
          action: 'channel_deleted',
          args: { channelId: decoded(match) },
        }),
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+\/channels\/([^/]+)\/permissions$/,
        (match) => ({
          action: 'channel_permissions_updated',
          args: {
            channelId: decoded(match),
            visibleRoleIds: body.visibleRoleIds,
          },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/roles$/,
        () => ({
          action: 'role_created',
          args: {
            name: body.name,
            permissions: body.permissions,
            roleId: CommunityRoleId.derive(
              communityId,
              actorIdentityId,
              createdAt,
            ).valueOf(),
          },
        }),
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+\/roles\/([^/]+)$/,
        (match) => ({
          action: 'role_updated',
          args: {
            name: body.name,
            permissions: body.permissions,
            roleId: decoded(match),
          },
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/roles\/([^/]+)$/,
        (match) => ({
          action: 'role_deleted',
          args: { roleId: decoded(match) },
        }),
      ],
      [
        'PUT',
        /^\/communities\/[^/]+\/members\/([^/]+)\/roles$/,
        (match) => ({
          action: 'member_roles_updated',
          args: { identityId: decoded(match), roleIds: body.roleIds },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/bans$/,
        () => ({
          action: 'member_banned',
          args: { identityId: body.identityId },
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/bans\/([^/]+)$/,
        (match) => ({
          action: 'member_unbanned',
          args: { identityId: decoded(match) },
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/members\/(?!me$)([^/]+)$/,
        (match) => ({
          action: 'member_kicked',
          args: { identityId: decoded(match) },
        }),
      ],
      [
        'DELETE',
        /^\/communities\/[^/]+\/members\/me$/,
        () => ({
          action: 'member_left',
          args: { identityId: actorIdentityId },
        }),
      ],
      [
        'PATCH',
        /^\/communities\/[^/]+$/,
        () => ({
          action: 'community_updated',
          args: optional({
            autoJoinEnabled: body.autoJoinEnabled,
            avatar: body.avatar,
            banner: body.banner,
            description: body.description,
            discoverable: body.discoverable,
            name: body.name,
          }),
        }),
      ],
      [
        'POST',
        /^\/community-membership-requests$/,
        () => ({
          action: 'member_joined',
          args: { identityId: actorIdentityId, method: 'automatic' },
        }),
      ],
      [
        'PATCH',
        /^\/community-membership-requests\/[^/]+$/,
        () => {
          const request = this.communityMembershipRequest as Record<
            string,
            string
          >;

          return body.status === 'accepted'
            ? {
                action: 'member_joined',
                args: {
                  identityId: request.identityId,
                  method: 'approval',
                  reference: request.id,
                },
              }
            : undefined;
        },
      ],
    ];
    const pathname = path.split('?')[0];

    for (const [ruleMethod, pattern, build] of rules) {
      const match = ruleMethod === method ? pattern.exec(pathname) : null;

      if (match) {
        return build(match);
      }
    }

    return undefined;
  }

  private async communityFrontier(communityId: string): Promise<string[]> {
    return Kernel.di
      .getService<CommunityFinder>(CommunityFinder)
      .findFrontier(new CommunityId(communityId));
  }

  /** The `operation` a client attaches to a community creation: the signed genesis. */
  private signCommunityGenesis(
    body: Record<string, unknown>,
    keyPair: KeyPair,
    createdAt: number,
  ): Record<string, unknown> {
    const ownerIdentityId = new IdentityId(
      keyPair.toPrimitives().publicKey,
    ).valueOf();
    const networkId = String(body.networkId);
    const nonce = randomUUID().replace(/-/g, '');
    const communityId = CommunityId.derive(
      networkId,
      ownerIdentityId,
      nonce,
    ).valueOf();
    const signed = signCommunityOperation({
      action: 'community_created',
      args: {
        autoJoinEnabled: body.autoJoinEnabled ?? false,
        description: body.description,
        discoverable: body.discoverable ?? true,
        name: body.name,
        nonce,
        visibility: body.visibility ?? 'private',
        ...(body.avatar ? { avatar: body.avatar } : {}),
        ...(body.banner ? { banner: body.banner } : {}),
      },
      communityId,
      createdAt,
      networkId,
      parents: [],
      signer: {
        deviceCredential: keyPair.toPrimitives().publicKey,
        deviceKeyPair: keyPair,
        id: ownerIdentityId,
        identityKeyPair: keyPair,
      },
    });

    return { ...body, nonce, operation: signed.body };
  }

  /** Adds the client-signed community operation to a community mutation body. */
  private async attachCommunityOperation(
    method: string,
    path: string,
    keyPair: KeyPair,
    createdAt: number,
  ): Promise<void> {
    const body = JSON.parse(this.body ?? '{}');
    const actorIdentityId = new IdentityId(
      keyPair.toPrimitives().publicKey,
    ).valueOf();
    const pathname = path.split('?')[0];

    if (body.operation) {
      return;
    }

    if (method === 'POST' && pathname === '/communities') {
      this.body = JSON.stringify(
        this.signCommunityGenesis(body, keyPair, createdAt),
      );

      return;
    }

    const spec = this.communityOperationFor(
      method,
      path,
      body,
      actorIdentityId,
      createdAt,
    );

    if (!spec || !this.communityId) {
      return;
    }

    const signed = signCommunityOperation({
      action: spec.action,
      args: spec.args,
      communityId: this.communityId,
      createdAt,
      networkId: String(this.currentNetworkId),
      parents: await this.communityFrontier(this.communityId),
      signer: {
        deviceCredential: keyPair.toPrimitives().publicKey,
        deviceKeyPair: keyPair,
        id: actorIdentityId,
        identityKeyPair: keyPair,
      },
    });

    this.lastCommunityOperationHash = signed.operation.getHash();
    this.body = JSON.stringify({ ...body, operation: signed.body });
  }

  /** Adds the client-signed conversation operation to a conversation mutation body. */
  private async attachConversationOperation(
    method: string,
    path: string,
    keyPair: KeyPair,
    createdAt: number,
  ): Promise<void> {
    const body = JSON.parse(this.body ?? '{}');
    const pathname = path.split('?')[0];
    const actorIdentityId = new IdentityId(
      keyPair.toPrimitives().publicKey,
    ).valueOf();
    const signer = {
      deviceCredential: keyPair.toPrimitives().publicKey,
      deviceKeyPair: keyPair,
      id: actorIdentityId,
    };

    if (body.operation || method !== 'POST' || pathname !== '/conversations') {
      return;
    }

    const genesis = this.conversationGenesis(body, actorIdentityId);
    const signed = signConversationOperation({
      action: genesis.action,
      args: genesis.args,
      conversationId: genesis.conversationId,
      createdAt,
      networkId: String(body.networkId),
      parents: [],
      signer,
    });

    this.body = JSON.stringify({
      ...body,
      operation: signed.body,
    });
  }

  private conversationGenesis(
    body: Record<string, unknown>,
    actorIdentityId: string,
  ): { action: string; args: Record<string, unknown>; conversationId: string } {
    const participantIds = [
      ...new Set([
        actorIdentityId,
        ...((body.participantIds as string[] | undefined) ?? []),
      ]),
    ].sort();

    return {
      action: 'conversation_created',
      args: { participantIds, type: 'one-to-one' },
      conversationId: ConversationId.deterministic(
        participantIds[0],
        participantIds[1] ?? participantIds[0],
        String(body.networkId),
      ).valueOf(),
    };
  }

  /** Adds the client-signed call record the call endpoints require to the body. */
  private async attachCallMutation(
    method: string,
    path: string,
    keyPair: KeyPair,
  ): Promise<void> {
    const pathname = path.split('?')[0].replace(/\/$/, '');
    const body = JSON.parse(this.body ?? '{}');
    const deviceCredential = keyPair.toPrimitives().publicKey;
    const signer: CallSigner = {
      deviceCredential,
      deviceKeyPair: keyPair,
      id: new IdentityId(deviceCredential).valueOf(),
    };
    const participant = /^\/calls\/([^/]+)\/participants(\/me)?$/.exec(
      pathname,
    );
    const end = /^\/calls\/([^/]+)$/.exec(pathname);

    if (this.callMutationDisabled || body.mutation) return;

    if (method === 'POST' && pathname === '/calls') {
      await this.attachCallStart(body, signer);

      return;
    }

    if (participant && method !== 'PATCH') {
      const at = Date.now();
      const callId = participant[1];
      const recordId = participantPayload({
        at,
        callId,
        identityId: signer.id,
        state: 'joined',
      }).id;
      const previous = this.callProofs.get(recordId);
      const state: CallParticipantState =
        method === 'POST'
          ? 'joined'
          : previous && this.callJoined.has(recordId)
            ? 'left'
            : 'declined';
      const signed = signCallParticipant({
        at,
        callId,
        predecessor: previous,
        signer,
        state,
      });

      this.callProofs.set(recordId, signed.proof);

      if (state === 'joined') this.callJoined.add(recordId);
      this.body = JSON.stringify({ at, mutation: mutationOf(signed.proof) });

      return;
    }

    if (method === 'DELETE' && end) {
      const at = Date.now();
      const signed = signCallEnd({ at, callId: end[1], signer });

      this.body = JSON.stringify({ at, mutation: mutationOf(signed.proof) });
    }
  }

  private async attachCallStart(
    body: Record<string, unknown>,
    signer: CallSigner,
  ): Promise<void> {
    const nonce = `api-call-${randomUUID().replace(/-/g, '')}`;
    const startedAt = Date.now();
    const networkId = String(this.currentNetworkId);

    if (body.scopeType === 'group_capability') {
      const signed = signCallStart({
        networkId,
        nonce,
        scope: {
          capabilityHash: String(body.capabilityHash),
          type: 'group_capability',
        },
        signer,
        startedAt,
      });

      this.body = JSON.stringify({
        ...body,
        mutation: mutationOf(signed.proof),
        nonce,
        startedAt,
      });

      return;
    }

    if (body.scopeType === 'conversation') {
      const conversationId = new ConversationId(String(body.conversationId));
      const conversations = Kernel.di.getService<ConversationRepository>(
        ConversationRepository,
      );
      const participantIds = (await conversations.hasById(conversationId))
        ? (
            await conversations.requireMetadataById(conversationId)
          ).getParticipantIds()
        : [];
      const signed = signCallStart({
        networkId,
        nonce,
        participantIds: participantIds.map((id) => id.valueOf()).sort(),
        scope: {
          conversationId: String(body.conversationId),
          type: 'conversation',
        },
        signer,
        startedAt,
      });

      this.body = JSON.stringify({
        ...body,
        mutation: mutationOf(signed.proof),
        nonce,
        startedAt,
      });

      return;
    }

    const sessionEpoch = 1;
    const signed = signCallStart({
      networkId,
      nonce,
      scope: {
        channelId: String(body.channelId),
        communityId: String(body.communityId),
        type: 'community_channel',
      },
      sessionEpoch,
      signer,
      startedAt,
    });

    this.body = JSON.stringify({
      ...body,
      mutation: mutationOf(signed.proof),
      nonce,
      sessionEpoch,
      startedAt,
    });
  }

  private async signCurrentRequest(
    method: string,
    path: string,
    timestamp: string = String(Date.now() + this.signedRequestOffsetMs),
    keyPair: KeyPair | undefined = undefined,
    identityId: IdentityId | undefined = undefined,
  ): Promise<void> {
    const signerKeyPair = await this.resolveSignerKeyPair(keyPair);
    const signerIdentityId = this.resolveSignerIdentityId(identityId);
    const createdAt = Date.now();

    await this.attachCommunityOperation(method, path, signerKeyPair, createdAt);
    await this.attachCallMutation(method, path, signerKeyPair);
    await this.attachConversationOperation(
      method,
      path,
      signerKeyPair,
      createdAt,
    );
    this.attachCommunityModerationLog(method, path, signerKeyPair, createdAt);

    const declaredBodyHash = this.declaredBodyHashOf(method, path);
    const signedRequestPayload = SignedHttpRequestSignature.signingContent({
      body: declaredBodyHash ?? this.getCurrentRequestBody(),
      method,
      path,
      timestamp: Number(timestamp),
    });

    this.headers['x-identity-id'] = signerIdentityId?.valueOf() || '';
    this.headers['x-timestamp'] = timestamp;
    this.headers['x-signature'] = signerKeyPair
      .sign(signedRequestPayload)
      .valueOf();
    delete this.headers['x-body-hash'];

    if (declaredBodyHash) {
      this.headers['x-body-hash'] = declaredBodyHash;
    }
  }

  /**
   * A block list upload signs the hash of the exact body bytes, declared in
   * `X-Body-Hash`, so the node authenticates it before reading the body.
   */
  private declaredBodyHashOf(method: string, path: string): string | undefined {
    if (method !== 'PUT' || path.replace(/\/$/, '') !== '/node/blocks') {
      return undefined;
    }

    return createHash('sha256')
      .update(JSON.stringify(this.body ? JSON.parse(this.body) : {}))
      .digest('hex');
  }

  private async ensureBlockSourcePublisherKeyPair(): Promise<KeyPair> {
    this.blockSourcePublisherKeyPair =
      this.blockSourcePublisherKeyPair ?? (await KeyPair.generate());

    return this.blockSourcePublisherKeyPair;
  }

  private async blockSourcePath(suffix: string): Promise<string> {
    const publisher = new IdentityId(
      (await this.ensureBlockSourcePublisherKeyPair()).toPrimitives().publicKey,
    );
    const named = this.blockSourcePublisherEncoding
      ? this.aliasOf(publisher, this.blockSourcePublisherEncoding)
      : publisher;

    return `/node/block-sources/${encodeURIComponent(named.valueOf())}${suffix}`;
  }

  private async otherIdentityIdUnder(encoding?: string): Promise<string> {
    await this.ensureOtherIdentityKeyPair();
    const other = this.otherIdentityId as IdentityId;

    return (encoding ? this.aliasOf(other, encoding) : other).valueOf();
  }

  private async setBlockApprovalBody(
    version: number,
    encoding?: string,
  ): Promise<void> {
    this.body = JSON.stringify({
      all: false,
      blockedIdentityIds: [await this.otherIdentityIdUnder(encoding)],
      version,
    });
  }

  private async setBlockExceptionsBody(encoding?: string): Promise<void> {
    this.body = JSON.stringify({
      identityIds: [await this.otherIdentityIdUnder(encoding)],
      nodePeerIds: [],
    });
  }

  /** A list the block source publisher signed, blocking the other identity named by `encoding` of its key. */
  private async signedBlockSourceList(
    version: number,
    encoding?: string,
  ): Promise<SignedNodeBlockList> {
    const publisher = await this.ensureBlockSourcePublisherKeyPair();
    const content = Buffer.from(
      canonicalize({
        blockedIdentityIds: [await this.otherIdentityIdUnder(encoding)],
        blockedNodePeerIds: [],
        issuedAt: Date.now(),
        ownerIdentityId: new IdentityId(
          publisher.toPrimitives().publicKey,
        ).valueOf(),
        type: 'pigeon-node-block-list',
        version,
      })!,
    );

    return new SignedNodeBlockList(
      content,
      publisher.sign(
        Buffer.concat([Buffer.from('pigeon:node-block-list:v1\n'), content]),
      ),
    );
  }

  private async adoptedBlockSource(
    autoApply: boolean,
  ): Promise<NodeBlockSource> {
    const publisher = await this.ensureBlockSourcePublisherKeyPair();

    return NodeBlockSource.adopt(
      new IdentityId(publisher.toPrimitives().publicKey),
      new NodeBlockSourceOrigin('https://publisher.example'),
      autoApply,
      new NodeBlockSourceVersionFloor(0),
    );
  }

  private async saveBlockSource(source: NodeBlockSource): Promise<void> {
    await Kernel.di
      .getService<NodeBlockSourceRepository>(NodeBlockSourceRepository)
      .save(source);
    await Kernel.di.getService<NodeBlockPolicy>(NodeBlockPolicy).load();
  }

  /** Stands in for a refresher fetch: the source receives what its publisher signed. */
  private async followBlockSource(
    version: number,
    autoApply: boolean,
  ): Promise<void> {
    const source = await this.adoptedBlockSource(autoApply);

    source.receive(await this.signedBlockSourceList(version), Timestamp.now());
    await this.saveBlockSource(source);
  }

  private async setNodeBlockListBody(
    version: number,
    blocked: string,
    owner: string,
    signer: string,
    encoding?: string,
    extraAliasEncoding?: string,
  ): Promise<void> {
    const identities: Record<string, () => Promise<KeyPair>> = {
      other: () => this.ensureOtherIdentityKeyPair(),
      owner: () => this.ensureIdentityKeyPair(),
    };
    const publicKeyOf = async (name: string): Promise<string> =>
      new IdentityId(
        (await identities[name]()).toPrimitives().publicKey,
      ).valueOf();
    const blockedNames = blocked === 'nobody' ? [] : blocked.split(',');
    const extraAliasIds = extraAliasEncoding
      ? [
          this.aliasOf(
            new IdentityId(await publicKeyOf('other')),
            extraAliasEncoding,
          ).valueOf(),
        ]
      : [];
    const blockedIdentityIds = (
      await Promise.all(
        blockedNames.map(async (name) => {
          const identityId = new IdentityId(await publicKeyOf(name.trim()));

          return (
            encoding ? this.aliasOf(identityId, encoding) : identityId
          ).valueOf();
        }),
      )
    )
      .concat(extraAliasIds)
      .sort();
    const unsigned = {
      blockedIdentityIds,
      blockedNodePeerIds: [] as string[],
      issuedAt: Date.now(),
      ownerIdentityId: await publicKeyOf(owner),
      type: 'pigeon-node-block-list',
      version,
    };
    const signerKeyPair = await identities[signer]();

    this.body = JSON.stringify({
      ...unsigned,
      identitySignature: signerKeyPair
        .sign(`pigeon:node-block-list:v1\n${canonicalize(unsigned)}`)
        .valueOf(),
    });
  }

  private resolveResponsePath(value: unknown, path: string): unknown {
    const arrayPath = /^(.*)\[(\d+)\]$/.exec(path);

    if (arrayPath) {
      const [, propertyName, indexValue] = arrayPath;
      const collection = propertyName
        ? (value as Record<string, unknown>)[propertyName]
        : value;
      const index = Number(indexValue);

      if (!Array.isArray(collection)) {
        throw new Error(`Response path ${path} does not contain an array.`);
      }

      return collection[index];
    }

    if (typeof value !== 'object' || value === null) {
      throw new Error(`Response path ${path} does not contain an object.`);
    }

    return (value as Record<string, unknown>)[path];
  }

  @before()
  public resetScenarioState(): void {
    this.binaryBody = undefined;
    this.body = undefined;
    this.callId = undefined;
    this.callMutationDisabled = false;
    this.callProofs.clear();
    this.callJoined.clear();
    this.admissionProofBits = undefined;
    this.identitySignedOffsetMs = 0;
    this.signedRequestOffsetMs = 0;
    this.communityChannelId = undefined;
    this.communityChannelMessageId = undefined;
    this.communityThreadRootMessageId = undefined;
    this.communityId = undefined;
    this.communityMembershipRequestId = undefined;
    this.communityMembershipRequest = undefined;
    this.communityRecordSequences.clear();
    this.communityRoleId = undefined;
    this.concurrentCallResponses = [];
    this.concurrentResponses = [];
    this.formData = undefined;
    this.headers = {};
    this.identityKeyPair = undefined;
    this.identityDeviceOwnerKeyPair = undefined;
    this.conversationId = undefined;
    this.currentNetworkId = undefined;
    this.createdIdentityId = undefined;
    this.registrationCode = undefined;
    this.keychainExternalIdentifier = undefined;
    this.messageId = undefined;
    this.notificationId = undefined;
    this.blockSourcePublisherKeyPair = undefined;
    this.blockSourcePublisherEncoding = undefined;
    this.otherIdentityId = undefined;
    this.otherIdentityKeyPair = undefined;
    this.ownerIdentityId = undefined;
    this.response = null;
    this.stickerPackId = undefined;
    this.stickerId = undefined;
    this.ipfsDefinition.resetScenarioState();
  }

  @before()
  public async startKernel(): Promise<void> {
    application ??= startApplication(this.ipfsDefinition);
    await application;
  }

  @before()
  public resetIdentitySourceAdmissionLimit(): void {
    process.env.IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE = '0';
    const limiter = Kernel.di.getService<IdentityAdmissionSourceRateLimiter>(
      IdentityAdmissionSourceRateLimiter,
    );
    limiter.reset();
  }

  @after()
  public restoreIdentityPublicationLimit(): void {
    delete process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE;
    delete process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE;
    delete process.env.IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE;
    delete process.env.NODE_BLOCK_LIST_MAX_BYTES;
  }

  @after()
  public async cleanupScenarioStorage(): Promise<void> {
    const database = Kernel.di.getService<EmbeddedLocalDatabase>(
      EmbeddedLocalDatabase,
    );
    const callRelayRecordRegistry =
      Kernel.di.getService<CallRelayRecordRegistry>(CallRelayRecordRegistry);

    await database.clear();
    await Kernel.di.getService<NodeBlockPolicy>(NodeBlockPolicy).load();
    callRelayRecordRegistry.clear();
    await this.ipfsDefinition.cleanupRegisteredNetworks();
    this.ipfsDefinition.cleanupStorageFolder(process.env.IPFS_STORAGE_PATH);
  }

  @given('I am an anonymous user')
  public iAmAnAnonymousUser(): void {
    return;
  }

  @given('the local node has no owner and no networks')
  public async theLocalNodeHasNoOwnerAndNoNetworks(): Promise<void> {
    const database = Kernel.di.getService<EmbeddedLocalDatabase>(
      EmbeddedLocalDatabase,
    );

    await database.delete('node_metadata', 'local');
    await database.delete('node_block_list', 'local');
    await Kernel.di.getService<NodeBlockPolicy>(NodeBlockPolicy).load();
    await this.ipfsDefinition.cleanupRegisteredNetworks();
  }

  /** Runs what `yarn node:reset-owner` runs, then reloads blocks as a restart does. */
  @given(
    'the node operator replaced the lost node owner with the other identity while the node was stopped',
  )
  public async theNodeOperatorReplacedTheLostNodeOwner(): Promise<void> {
    const otherKeyPair = await this.ensureOtherIdentityKeyPair();

    await Kernel.di
      .getService<NodeOwnerSettingsResetter>(NodeOwnerSettingsResetter)
      .reset(new IdentityId(otherKeyPair.toPrimitives().publicKey));
    await Kernel.di.getService<NodeBlockPolicy>(NodeBlockPolicy).load();
  }

  /** Stores what a node could hold from before ids had to be canonical, the way an upgraded node finds it. */
  @given(
    'the node stored the other identity under {string} of its key as a block exception and a source approval',
  )
  public async theNodeStoredAnAliasAsExceptionAndApproval(
    encoding: string,
  ): Promise<void> {
    const other = new IdentityId(
      (await this.ensureOtherIdentityKeyPair()).toPrimitives().publicKey,
    );
    const alias = this.aliasOf(other, encoding);
    const publisher = new IdentityId(
      (await this.ensureBlockSourcePublisherKeyPair()).toPrimitives().publicKey,
    );
    const sources = Kernel.di.getService<NodeBlockSourceRepository>(
      NodeBlockSourceRepository,
    );
    const source = await sources.find(publisher);

    await Kernel.di
      .getService<NodeBlockExceptionsRepository>(NodeBlockExceptionsRepository)
      .save(new NodeBlockEntries([alias], []));
    await sources.save(
      NodeBlockSource.fromPrimitives({
        ...source.toPrimitives(),
        approved: {
          identityIds: [alias.valueOf(), other.valueOf()],
          nodePeerIds: [],
        },
      }),
    );
  }

  @given('the local node owner was stored under {string} of my key')
  public async theLocalNodeOwnerWasStoredUnderAnAlias(
    encoding: string,
  ): Promise<void> {
    const database = Kernel.di.getService<EmbeddedLocalDatabase>(
      EmbeddedLocalDatabase,
    );
    const metadata = await database.findOne('node_metadata', 'local');

    await database.save('node_metadata', 'local', {
      ...(metadata as Record<string, unknown>),
      owner: this.aliasOf(
        this.ownerIdentityId as IdentityId,
        encoding,
      ).valueOf(),
    });
  }

  /** Stores the owner-signed list as an upgraded node holds it: the alias is kept verbatim. */
  @given(
    'the node stored its own block list version {int} blocking the other identity under {string} of its key',
  )
  public async theNodeStoredAnAliasAsOwnBlockList(
    version: number,
    encoding: string,
  ): Promise<void> {
    await this.setNodeBlockListBody(
      version,
      'other',
      'owner',
      'owner',
      encoding,
    );
    await Kernel.di
      .getService<EmbeddedLocalDatabase>(EmbeddedLocalDatabase)
      .save('node_block_list', 'local', {
        _id: 'local',
        blockList: JSON.parse(String(this.body)),
      });
  }

  /** Stores the owner-signed list naming the other identity and its alias, as an upgraded node holds it. */
  @given(
    'the node stored its own block list version {int} blocking the other identity and the other identity under {string} of its key',
  )
  public async theNodeStoredMixedOwnBlockList(
    version: number,
    encoding: string,
  ): Promise<void> {
    await this.setNodeBlockListBody(
      version,
      'other',
      'owner',
      'owner',
      undefined,
      encoding,
    );
    await Kernel.di
      .getService<EmbeddedLocalDatabase>(EmbeddedLocalDatabase)
      .save('node_block_list', 'local', {
        _id: 'local',
        blockList: JSON.parse(String(this.body)),
      });
  }

  @then('the node keeps its own block list')
  public async theNodeKeepsItsOwnBlockList(): Promise<void> {
    expect(
      await Kernel.di
        .getService<NodeBlockListRepository>(NodeBlockListRepository)
        .findLocal(),
    ).to.be.instanceOf(NodeBlockList);
  }

  /** Runs the startup purge, then reloads blocks, as a restart does. */
  @when('the node restarts')
  public async theNodeRestarts(): Promise<void> {
    await Kernel.di
      .getService<NonCanonicalIdentityIdsPurgeInitializer>(
        NonCanonicalIdentityIdsPurgeInitializer,
      )
      .ensure();
    await Kernel.di.getService<NodeBlockPolicy>(NodeBlockPolicy).load();
  }

  @then(
    'the stored block exception and source approval name only the canonical other identity id',
  )
  public async theStoredBlocksNameOnlyCanonicalIds(): Promise<void> {
    const publisher = new IdentityId(
      (await this.ensureBlockSourcePublisherKeyPair()).toPrimitives().publicKey,
    );
    const exceptions = await Kernel.di
      .getService<NodeBlockExceptionsRepository>(NodeBlockExceptionsRepository)
      .find();
    const source = await Kernel.di
      .getService<NodeBlockSourceRepository>(NodeBlockSourceRepository)
      .find(publisher);

    expect(exceptions.getIdentityIds()).to.deep.equal([]);
    expect(source.applied().toPrimitives().identityIds).to.deep.equal([
      this.otherIdentityId?.valueOf(),
    ]);
  }

  @then('the local node is owned by the other identity')
  public async theLocalNodeIsOwnedByTheOtherIdentity(): Promise<void> {
    const otherIdentityId = this.otherIdentityId;
    const node = await Kernel.di
      .getService<NodeLoaderService>(NodeLoaderService)
      .loadNode();

    expect(otherIdentityId).not.to.equal(undefined);
    expect(node.isOwnedBy(otherIdentityId as IdentityId)).to.equal(true);
  }

  @given('a node peer heartbeat has been received')
  public async aNodePeerHeartbeatHasBeenReceived(): Promise<void> {
    const database = Kernel.di.getService<EmbeddedLocalDatabase>(
      EmbeddedLocalDatabase,
    );
    const ownerKeyPair = await KeyPair.generate();
    const ownerIdentityId = new IdentityId(
      ownerKeyPair.toPrimitives().publicKey,
    );

    await database.deleteMany('node_peers', () => true);
    await database.save('node_peers', '550e8400-e29b-41d4-a716-446655440010', {
      lastSeenAt: Date.now(),
      networks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          name: 'public',
          type: 'public',
        },
      ],
      owner: ownerIdentityId.valueOf(),
    });
  }

  @given('I set json body')
  public iSetJsonBody(body: string): void {
    this.body = body;
  }

  @given('I set json body with {string} of {int} characters')
  public iSetJsonBodyWithFieldOfCharacters(
    field: string,
    length: number,
  ): void {
    this.body = JSON.stringify({ [field]: 'a'.repeat(length) });
  }

  @given('I set header {string} to {string}')
  public iSetHeaderTo(header: string, value: string): void {
    this.headers[header] = value;
  }

  @given(
    'I set a registration code body with {int} uses expiring in {int} days',
  )
  public iSetARegistrationCodeBody(maxUses: number, days: number): void {
    this.body = JSON.stringify({
      expiresAt: Date.now() + days * 86_400_000 - 60_000,
      maxUses,
    });
  }

  @given('I remember the issued registration code')
  public iRememberTheIssuedRegistrationCode(): void {
    const { code, id } = this.response.data as { code: string; id: string };

    this.registrationCode = { code, id };
  }

  @given('I send the remembered registration code')
  public iSendTheRememberedRegistrationCode(): void {
    if (!this.registrationCode) {
      throw new Error('A registration code must be issued first.');
    }

    this.headers['X-Registration-Code'] = this.registrationCode.code;
  }

  @given('I sign a DELETE request to the remembered registration code')
  public async iSignADeleteRequestToTheRememberedRegistrationCode(): Promise<void> {
    if (!this.registrationCode) {
      throw new Error('A registration code must be issued first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'DELETE',
      `/node/registration-codes/${this.registrationCode.id}`,
    );
  }

  @when('I DELETE the remembered registration code')
  public async iDeleteTheRememberedRegistrationCode(): Promise<void> {
    if (!this.registrationCode) {
      throw new Error('A registration code must be issued first.');
    }

    this.response = await this.restClient.delete(
      `/node/registration-codes/${this.registrationCode.id}`,
      undefined,
      { headers: this.headers },
    );
  }

  @given('I switch to a new identity')
  public iSwitchToANewIdentity(): void {
    this.identityKeyPair = undefined;
    this.identityRecoveryKeyPair = undefined;
    this.identityDeviceOwnerKeyPair = undefined;
    this.ownerIdentityId = undefined;
    this.createdIdentityId = undefined;
  }

  @given('I clear request headers')
  public iClearRequestHeaders(): void {
    this.headers = {};
  }

  @given('I spoof the current node owner identity header')
  public iSpoofTheCurrentNodeOwnerIdentityHeader(): void {
    if (!this.ownerIdentityId) {
      throw new Error('Node owner identity must be initialized first.');
    }

    this.headers['x-identity-id'] = this.ownerIdentityId.valueOf();
  }

  @given('I sign the current keychain publication request')
  public async iSignTheCurrentKeychainPublicationRequest(): Promise<void> {
    if (!this.body) {
      throw new Error('Body must be set before signing the request.');
    }

    const unsignedBody = this.body;
    await this.ensureAuthenticatedIdentityIsPublished();
    this.body = unsignedBody;

    const keyPair = await this.ensureIdentityKeyPair();
    const ownerIdentityId = this.ownerIdentityId as IdentityId;
    const parsedBody = JSON.parse(this.body);
    const keychainSignaturePayload = {
      encryptedPayload: parsedBody.encryptedPayload,
      ownerIdentityId: ownerIdentityId.valueOf(),
      previousKeychainExternalIdentifier:
        parsedBody.previousKeychainExternalIdentifier ?? undefined,
      timestamp: parsedBody.timestamp,
      version: parsedBody.version,
    };
    const signature = keyPair
      .sign(KeychainSignature.signingContent(keychainSignaturePayload))
      .valueOf();
    const signedBody = {
      ...parsedBody,
      signature,
    };

    this.body = JSON.stringify(signedBody);
    await this.signCurrentRequest('POST', '/keychains');
  }

  @given('I sign the current private authorization challenge request')
  public async iSignTheCurrentPrivateAuthorizationChallengeRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/private-authorization/challenges');
  }

  @given('I set a valid private authorization genesis body')
  public async iSetAValidPrivateAuthorizationGenesisBody(): Promise<void> {
    const keyPair = await this.ensureIdentityDeviceOwnerKeyPair();
    const identityId = this.ownerIdentityId as IdentityId;
    const ownerDeviceKey = new Ed25519PrivateDeviceCredentialCodec()
      .toDeviceKey(
        DeviceCredential.fromString(keyPair.toPrimitives().publicKey),
      )
      .valueOf();
    const scopeId = randomBytes(32).toString('base64url');
    const protectedState = Buffer.from('private-genesis-state');
    const mlsContextHash = createHash('sha256')
      .update(protectedState)
      .digest('base64url');
    const hash = (value: unknown) =>
      createHash('sha256').update(canonicalize(value)!).digest('base64url');
    const policy = {
      authorityKeys: [ownerDeviceKey],
      devices: [
        {
          deviceKey: ownerDeviceKey,
          mlsCredentialHash: randomBytes(32).toString('base64url'),
        },
      ],
      freshnessAuthorityKey: ownerDeviceKey,
      leaseRevocationHpkeKey: randomBytes(32).toString('base64url'),
      leaseRevocationKey: ownerDeviceKey,
      sequencerKey: ownerDeviceKey,
      threshold: 1,
      version: 1,
    };
    const head = {
      mlsContextHash,
      mlsEpoch: 0,
      parentHeadHash: null as string | null,
      policyHash: hash(policy),
      revision: 0,
      scopeId,
    };
    const unsignedGenesis = {
      ...head,
      headHash: hash(head),
      policy,
      version: 1,
    };
    const signedGenesisJson = PrivateGenesisSignature.sign(
      canonicalize(unsignedGenesis)!,
      new PrivateKey(keyPair.toPrimitives().privateKey),
    );

    this.privateAuthorizationScopeId = scopeId;
    this.body = JSON.stringify({
      identityAuthorizationEpoch: 'genesis',
      identityAuthorizationRevision: 0,
      ownerDeviceKey,
      projection: {
        autoJoinEnabled: false,
        bannedMemberIds: [],
        createdAt: 1,
        description: 'Protected API community',
        discoverable: false,
        id: scopeId,
        memberIds: [identityId.valueOf()],
        memberRoles: [],
        name: 'Protected API community',
        networkId: '550e8400-e29b-41d4-a716-446655440000',
        ownerIdentityId: identityId.valueOf(),
        roles: [],
        textChannels: [],
        visibility: 'private',
        voiceChannels: [],
      },
      protectedMlsState: protectedState.toString('base64url'),
      signedGenesisJson,
    });
  }

  @given('I add a large valid channel to the private authorization projection')
  public iAddALargeValidChannelToThePrivateAuthorizationProjection(): void {
    const body = JSON.parse(this.body) as {
      projection: { textChannels: Record<string, unknown>[] };
    };
    const channel = (index: number) => ({
      createdAt: 1,
      id: `channel-${index}`,
      name: 'Large projection channel',
      permissions: { visibleRoleIds: ['everyone'] },
      type: 'text',
    });
    const channelBytes = Buffer.byteLength(JSON.stringify(channel(0)));
    const channelCount = Math.ceil(
      PrivateAuthorizationRequestBodyLimit / channelBytes,
    );

    body.projection.textChannels = Array.from(
      { length: channelCount },
      (_, index) => channel(index),
    );
    this.body = JSON.stringify(body);
  }

  @given('I sign the current private authorization scope request')
  public async iSignTheCurrentPrivateAuthorizationScopeRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/private-authorization/scopes');
  }

  @given(
    'another identity signs the current private authorization scope request',
  )
  public async anotherIdentitySignsTheCurrentPrivateAuthorizationScopeRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/private-authorization/scopes',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the current identity owns the node')
  public async theCurrentIdentityOwnsTheNode(): Promise<void> {
    const identityId = new IdentityId(
      (await this.ensureIdentityKeyPair()).toPrimitives().publicKey,
    );
    const assigner = Kernel.di.getService<NodeOwnerAssigner>(NodeOwnerAssigner);

    await assigner.assignOwner(
      new NodeOwnerAssignerMessage(identityId.valueOf(), identityId.valueOf()),
    );
    await Kernel.di.getService<NodeLoaderService>(NodeLoaderService).loadNode();
  }

  @given('the current identity is published')
  public async theCurrentIdentityIsPublished(): Promise<void> {
    await this.ensureAuthenticatedIdentityIsPublished();
  }

  @then('the private authorization scope is durably provisioned')
  public async thePrivateAuthorizationScopeIsDurablyProvisioned(): Promise<void> {
    const scopeId = this.privateAuthorizationScopeId as string;
    const repository = Kernel.di.getService<PrivateAuthorizationRepository>(
      PrivateAuthorizationRepository,
    );

    expect(await repository.hasScope(scopeId)).to.equal(true);
    expect(await repository.requireProjection(scopeId)).to.containSubset({
      id: scopeId,
    });
    expect(await repository.requireProtectedMlsState(scopeId)).to.equal(
      Buffer.from('private-genesis-state').toString('base64url'),
    );
  }

  @given(
    'I set a non-string private authorization challenge body containing {string}',
  )
  public iSetANonStringPrivateAuthorizationChallengeBodyContaining(
    sensitiveValue: string,
  ): void {
    this.body = JSON.stringify({
      signedOperationJson: { sensitiveValue },
    });
  }

  @given('I set a maximum-length private authorization operation')
  public iSetAMaximumLengthPrivateAuthorizationOperation(): void {
    this.body = JSON.stringify({
      signedOperationJson: 'x'.repeat(262144),
    });
  }

  @given('I set a maximum-size private authorization operation envelope')
  public iSetAMaximumSizePrivateAuthorizationOperationEnvelope(): void {
    this.body = JSON.stringify({
      controlFrame: {
        encryptedMlsState: '😀'.repeat(1_398_102),
        mlsMessage: '😀'.repeat(349_526),
        signedTransitionJson: '😀'.repeat(262_144),
      },
      signedFreshnessProofJson: '😀'.repeat(262_144),
      signedOperationJson: '😀'.repeat(262_144),
    });
  }

  @given('I sign the current private authorization operation request')
  public async iSignTheCurrentPrivateAuthorizationOperationRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/private-authorization/operations');
  }

  @given('identity publications are limited to {int} per minute')
  public identityPublicationsAreLimitedToPerMinute(limit: number): void {
    process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE = String(limit);
  }

  @given('identity admissions are limited to {int} per network per minute')
  public identityAdmissionsAreLimitedToPerNetworkPerMinute(
    limit: number,
  ): void {
    process.env.IDENTITIES_NETWORK_ADMISSION_RATE_LIMIT_PER_MINUTE =
      String(limit);
  }

  @given('identity admissions are limited to {int} per source per minute')
  public identityAdmissionsAreLimitedToPerSourcePerMinute(limit: number): void {
    process.env.IDENTITIES_SOURCE_ADMISSION_RATE_LIMIT_PER_MINUTE =
      String(limit);
  }

  @given('identity admission proofs are mined at exactly {int} bits')
  public identityAdmissionProofsAreMinedAtExactly(bits: number): void {
    this.admissionProofBits = bits;
  }

  @given(
    'this node recently accepted {int} identity admissions into the current network',
  )
  public async thisNodeRecentlyAcceptedIdentityAdmissions(
    admissions: number,
  ): Promise<void> {
    const load = Kernel.di.getService<IdentityAdmissionLoadRepository>(
      IdentityAdmissionLoadRepository,
    );
    const network = new NetworkId(
      this.currentNetworkId ?? '123e4567-e89b-12d3-a456-426614174000',
    );

    for (let admission = 0; admission < admissions; admission += 1) {
      await load.record(
        new IdentityId(
          generateKeyPairSync('ed25519')
            .publicKey.export({ format: 'pem', type: 'spki' })
            .toString(),
        ),
        [network],
      );
    }
  }

  @given('requests are signed {int} seconds ago')
  public requestsAreSignedSecondsAgo(seconds: number): void {
    this.signedRequestOffsetMs = -seconds * 1_000;
  }

  @given('identity bodies are signed {int} minutes ago')
  public identityBodiesAreSignedMinutesAgo(minutes: number): void {
    this.identitySignedOffsetMs = -minutes * 60_000;
  }

  @given(
    'I set a client-signed identity body with name {string} and handle {string}',
  )
  public async iSetAClientSignedIdentityBody(
    name: string,
    handle: string,
  ): Promise<void> {
    await this.buildClientSignedIdentityBody(name, handle);
  }

  @given('I set a signed device enrollment transition body')
  public async iSetASignedDeviceEnrollmentTransitionBody(): Promise<void> {
    const owner = await this.ensureIdentityDeviceOwnerKeyPair();
    const identityId = this.ownerIdentityId as IdentityId;
    this.identityDeviceTargetKeyPair = await KeyPair.generate();
    const target = this.identityDeviceTargetKeyPair;
    const unsigned = DeviceAuthorizationTransition.enrollment(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      DeviceAuthorizationRevision.initial(),
      DeviceCredential.fromString(owner.toPrimitives().publicKey),
      DeviceCredential.fromString(target.toPrimitives().publicKey),
      new PairingAuthorization(
        PairingId.generate(),
        new PairingExpiration(Timestamp.now().valueOf() + 60_000),
        Timestamp.now(),
      ),
    );

    const proven = unsigned.provePossession(
      target.sign(unsigned.getProofOfPossessionPayload()),
    );

    this.body = JSON.stringify(
      proven.authorize(owner.sign(proven.getSigningPayload())).toPrimitives(),
    );
    this.signedDeviceAuthorizationTransitions.push(this.body);
  }

  @given(
    'I set a signed self-retirement transition body for the enrolled device',
  )
  public iSetASignedSelfRetirementTransitionBodyForTheEnrolledDevice(): void {
    const identityId = this.ownerIdentityId as IdentityId;
    const target = this.identityDeviceTargetKeyPair as KeyPair;
    const credential = DeviceCredential.fromString(
      target.toPrimitives().publicKey,
    );
    const unsigned = DeviceAuthorizationTransition.revocation(
      identityId,
      DeviceAuthorizationOperationId.generate(),
      new DeviceAuthorizationRevision(1),
      credential,
      credential,
    );

    this.body = JSON.stringify(
      unsigned
        .authorize(target.sign(unsigned.getSigningPayload()))
        .toPrimitives(),
    );
    this.signedDeviceAuthorizationTransitions.push(this.body);
  }

  @given(
    'I attach sealed secrets for the remaining devices with generation {int}',
  )
  public async iAttachSealedSecretsForTheRemainingDevicesWithGeneration(
    generation: number,
  ): Promise<void> {
    const owner = await this.ensureIdentityDeviceOwnerKeyPair();
    const transition = JSON.parse(this.body as string) as {
      authorCredential: string;
      identityId: string;
      revision: number;
    };
    const publisherCredential = DeviceCredential.fromString(
      transition.authorCredential,
    );
    const publisher = [owner, this.identityDeviceTargetKeyPair].find(
      (candidate) =>
        candidate !== undefined &&
        publisherCredential.isEqual(
          DeviceCredential.fromString(candidate.toPrimitives().publicKey),
        ),
    ) as KeyPair;
    const recipientCredential = DeviceCredential.fromString(
      owner.toPrimitives().publicKey,
    ).toWire();
    const sealedSecret = 'c2VhbGVk';

    this.body = JSON.stringify({
      ...transition,
      sealedSecrets: {
        entries: [
          {
            recipientCredential,
            sealedSecret,
            signature: publisher
              .sign(
                DeviceSealedSecretBundle.signingPayload({
                  authorizationRevision: transition.revision,
                  generation,
                  identityId: transition.identityId,
                  publisherCredential: publisherCredential.toWire(),
                  recipientCredential,
                  sealedSecret,
                }),
              )
              .valueOf(),
          },
        ],
        generation,
      },
    });
  }

  @given('I sign the current device authorization checkpoint request')
  public async iSignTheCurrentDeviceAuthorizationCheckpointRequest(): Promise<void> {
    await this.signDeviceAuthorizationRequest(
      '',
      await this.ensureIdentityDeviceOwnerKeyPair(),
    );
  }

  @given(
    'the enrolled device signs the current device authorization checkpoint request',
  )
  public async theEnrolledDeviceSignsTheCurrentDeviceAuthorizationCheckpointRequest(): Promise<void> {
    await this.signDeviceAuthorizationRequest(
      '',
      this.identityDeviceTargetKeyPair as KeyPair,
    );
  }

  @given(
    'I set a self-retirement transition body for the enrolled device signed by another key',
  )
  public async iSetASelfRetirementTransitionBodySignedByAnotherKey(): Promise<void> {
    const target = this.identityDeviceTargetKeyPair as KeyPair;
    const credential = DeviceCredential.fromString(
      target.toPrimitives().publicKey,
    );
    const unsigned = DeviceAuthorizationTransition.revocation(
      this.ownerIdentityId as IdentityId,
      DeviceAuthorizationOperationId.generate(),
      new DeviceAuthorizationRevision(1),
      credential,
      credential,
    );
    const forger = await KeyPair.generate();

    this.body = JSON.stringify(
      unsigned
        .authorize(forger.sign(unsigned.getSigningPayload()))
        .toPrimitives(),
    );
  }

  @given('I set the raw JSON body {string}')
  public iSetTheRawJsonBody(body: string): void {
    this.binaryBody = Buffer.from(body);
    this.headers['content-type'] = 'application/json';
  }

  @given('I set a JSON body of {int} megabytes')
  public iSetAJsonBodyOfMegabytes(megabytes: number): void {
    this.binaryBody = Buffer.from(
      JSON.stringify({ padding: 'a'.repeat(megabytes * 1024 * 1024) }),
    );
    this.headers['content-type'] = 'application/json';
  }

  private async signDeviceAuthorizationRequest(
    suffix: string,
    device: KeyPair,
  ): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.body = undefined;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}${suffix}`;
    await this.signCurrentRequest('GET', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = SignedHttpRequestSignature.signingContent({
      body: this.getCurrentRequestBody(),
      method: 'GET',
      path,
      timestamp: Number(timestamp),
    });
    this.headers['x-device-credential'] = new IdentityId(
      device.toPrimitives().publicKey,
    ).valueOf();
    this.headers['x-device-signature'] = device.sign(payload).valueOf();
  }

  private async signDeviceAuthorizationRecoveryRequest(
    suffix: string,
  ): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.body = undefined;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}${suffix}`;
    await this.signCurrentRequest('GET', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = SignedHttpRequestSignature.signingContent({
      body: this.getCurrentRequestBody(),
      method: 'GET',
      path,
      timestamp: Number(timestamp),
    });
    const recoveryAuthority = await this.ensureIdentityRecoveryKeyPair();
    this.headers['x-recovery-signature'] = recoveryAuthority
      .sign(payload)
      .valueOf();
  }

  @given('I sign the current device transition log request')
  public async iSignTheCurrentDeviceTransitionLogRequest(): Promise<void> {
    await this.signDeviceAuthorizationRequest(
      '/transitions',
      await this.ensureIdentityDeviceOwnerKeyPair(),
    );
  }

  @given('the enrolled device signs the current device transition log request')
  public async theEnrolledDeviceSignsTheCurrentDeviceTransitionLogRequest(): Promise<void> {
    await this.signDeviceAuthorizationRequest(
      '/transitions',
      this.identityDeviceTargetKeyPair as KeyPair,
    );
  }

  @given('I sign the current device transition log recovery request')
  public async iSignTheCurrentDeviceTransitionLogRecoveryRequest(): Promise<void> {
    await this.signDeviceAuthorizationRecoveryRequest('/transitions');
  }

  @given('another identity signs the current device transition log request')
  public async anotherIdentitySignsTheCurrentDeviceTransitionLogRequest(): Promise<void> {
    const targetIdentityId = this.ownerIdentityId as IdentityId;
    const signer = await this.ensureOtherIdentityKeyPair();
    const signerIdentityId = this.otherIdentityId as IdentityId;
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/identity-devices/${encodeURIComponent(targetIdentityId.valueOf())}/transitions`,
      String(Date.now()),
      signer,
      signerIdentityId,
    );
  }

  @then(
    'response serves the signed device authorization transitions after revision {int}',
  )
  public responseServesTheSignedDeviceAuthorizationTransitionsAfterRevision(
    after: number,
  ): void {
    expect(this.response?.data).to.deep.equal({
      concurrentRecoveries: [],
      identityId: this.ownerIdentityId?.valueOf(),
      recoveries: [],
      transitions: this.signedDeviceAuthorizationTransitions
        .map((body) => JSON.parse(body) as { revision: number })
        .filter(({ revision }) => revision > after),
    });
  }

  @given('I sign the current device list request')
  public async iSignTheCurrentDeviceListRequest(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.body = undefined;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}/devices`;
    await this.signCurrentRequest('GET', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = SignedHttpRequestSignature.signingContent({
      body: this.getCurrentRequestBody(),
      method: 'GET',
      path,
      timestamp: Number(timestamp),
    });
    const device = await this.ensureIdentityDeviceOwnerKeyPair();
    this.headers['x-device-credential'] = new IdentityId(
      device.toPrimitives().publicKey,
    ).valueOf();
    this.headers['x-device-signature'] = device.sign(payload).valueOf();
  }

  @given('I set an unsigned sealed secret bundle body')
  public iSetAnUnsignedSealedSecretBundleBody(): void {
    this.body = JSON.stringify({
      authorizationRevision: 1,
      entries: [
        {
          recipientCredential: 'unsigned-recipient',
          sealedSecret: 'c2VhbGVk',
          signature: 'unsigned-signature',
        },
      ],
      generation: 1,
    });
  }

  @given('I set a duplicate recipient sealed secret bundle body')
  public async iSetADuplicateRecipientSealedSecretBundleBody(): Promise<void> {
    const device = await this.ensureIdentityDeviceOwnerKeyPair();
    const entry = {
      recipientCredential: new IdentityId(
        device.toPrimitives().publicKey,
      ).valueOf(),
      sealedSecret: 'c2VhbGVk',
      signature: 'unsigned-signature',
    };
    this.body = JSON.stringify({
      authorizationRevision: 0,
      entries: [entry, entry],
      generation: 1,
    });
  }

  @given(
    'I set a sealed secret bundle body for my device with generation {int}',
  )
  public async iSetASealedSecretBundleBodyForMyDeviceWithGeneration(
    generation: number,
  ): Promise<void> {
    const device = await this.ensureIdentityDeviceOwnerKeyPair();
    const credential = DeviceCredential.fromString(
      device.toPrimitives().publicKey,
    ).toWire();
    const sealedSecret = 'c2VhbGVk';
    const signature = device.sign(
      DeviceSealedSecretBundle.signingPayload({
        authorizationRevision: 0,
        generation,
        identityId: (this.ownerIdentityId as IdentityId).valueOf(),
        publisherCredential: credential,
        recipientCredential: credential,
        sealedSecret,
      }),
    );

    this.body = JSON.stringify({
      authorizationRevision: 0,
      entries: [
        {
          recipientCredential: credential,
          sealedSecret,
          signature: signature.valueOf(),
        },
      ],
      generation,
    });
  }

  @given('I sign the current sealed secret delivery request')
  public async iSignTheCurrentSealedSecretDeliveryRequest(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.body = undefined;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}/sealed-secrets`;
    await this.signCurrentRequest('GET', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = SignedHttpRequestSignature.signingContent({
      body: this.getCurrentRequestBody(),
      method: 'GET',
      path,
      timestamp: Number(timestamp),
    });
    const device = await this.ensureIdentityDeviceOwnerKeyPair();
    this.headers['x-device-credential'] = new IdentityId(
      device.toPrimitives().publicKey,
    ).valueOf();
    this.headers['x-device-signature'] = device.sign(payload).valueOf();
  }

  @given('I sign the current sealed secret bundle request')
  public async iSignTheCurrentSealedSecretBundleRequest(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}/sealed-secrets`;
    await this.signCurrentRequest('PUT', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = SignedHttpRequestSignature.signingContent({
      body: this.getCurrentRequestBody(),
      method: 'PUT',
      path,
      timestamp: Number(timestamp),
    });
    const device = await this.ensureIdentityDeviceOwnerKeyPair();
    this.headers['x-device-credential'] = new IdentityId(
      device.toPrimitives().publicKey,
    ).valueOf();
    this.headers['x-device-signature'] = device.sign(payload).valueOf();
  }

  @when('I PUT the current sealed secret bundle')
  public async iPUTTheCurrentSealedSecretBundle(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.put(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}/sealed-secrets`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET the current sealed secret delivery')
  public async iGETTheCurrentSealedSecretDelivery(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.get(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}/sealed-secrets`,
      this.headers,
    );
  }

  @given('another identity signs the current device list request')
  public async anotherIdentitySignsTheCurrentDeviceListRequest(): Promise<void> {
    const targetIdentityId = this.ownerIdentityId as IdentityId;
    const signer = await this.ensureOtherIdentityKeyPair();
    const signerIdentityId = this.otherIdentityId as IdentityId;
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/identity-devices/${encodeURIComponent(targetIdentityId.valueOf())}/devices`,
      String(Date.now()),
      signer,
      signerIdentityId,
    );
  }

  @given('I sign the current device authorization checkpoint recovery request')
  public async iSignTheCurrentDeviceAuthorizationCheckpointRecoveryRequest(): Promise<void> {
    await this.signDeviceAuthorizationRecoveryRequest('');
  }

  @given(
    'another identity signs the current device authorization checkpoint request',
  )
  public async anotherIdentitySignsTheCurrentDeviceAuthorizationCheckpointRequest(): Promise<void> {
    const targetIdentityId = this.ownerIdentityId as IdentityId;
    const signer = await this.ensureOtherIdentityKeyPair();
    const signerIdentityId = this.otherIdentityId as IdentityId;
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/identity-devices/${encodeURIComponent(targetIdentityId.valueOf())}`,
      String(Date.now()),
      signer,
      signerIdentityId,
    );
  }

  @then('the genesis device authorization checkpoint exists')
  public async theGenesisDeviceAuthorizationCheckpointExists(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    const authorization = await Kernel.di
      .getService<DeviceAuthorizationRepository>(DeviceAuthorizationRepository)
      .require(identityId);

    expect(authorization.getRevision().valueOf()).to.equal(0);
  }

  @then('response is the current device list')
  public async responseIsTheCurrentDeviceList(): Promise<void> {
    const device = await this.ensureIdentityDeviceOwnerKeyPair();

    expect(this.response?.data).to.deep.equal({
      credentials: [new IdentityId(device.toPrimitives().publicKey).valueOf()],
      epoch: 'genesis',
      identityId: this.ownerIdentityId?.valueOf(),
      revision: 0,
    });
  }

  @then('response is the current device authorization checkpoint')
  public responseIsTheCurrentDeviceAuthorizationCheckpoint(): void {
    expect(this.response?.data).to.deep.equal({
      compromisedCredentials: [],
      epoch: 'genesis',
      identityId: this.ownerIdentityId?.valueOf(),
      revision: 0,
    });
  }

  @given('I add identity unlock fields')
  public iAddIdentityUnlockFields(): void {
    const body = JSON.parse(this.body ?? '{}') as Record<string, unknown>;

    body.encryptedKeyPair = {
      encryptedPrivateKey: 'unlock-encrypted-private-key',
      publicKey: 'unlock-public-key',
    };
    body.encryptedMasterKey = 'unlock-encrypted-master-key';
    body.masterKeyDerivation = {
      algorithm: 'scrypt',
      salt: 'unlock-salt',
      version: 1,
    };
    this.body = JSON.stringify(body);
  }

  @given('I add undeclared identity field {string}')
  public iAddUndeclaredIdentityField(field: string): void {
    const body = JSON.parse(this.body ?? '{}') as Record<string, unknown>;

    body[field] = 'must-not-be-accepted';
    this.body = JSON.stringify(body);
  }

  @given('I add undeclared identity profile field {string}')
  public iAddUndeclaredIdentityProfileField(field: string): void {
    const body = JSON.parse(this.body ?? '{}') as {
      profile?: Record<string, unknown>;
    };

    assert(
      body.profile !== undefined,
      new Error('Identity profile must be configured first.'),
    );
    body.profile[field] = 'must-not-be-accepted';
    this.body = JSON.stringify(body);
  }

  @given('I remove the identity profile')
  public iRemoveTheIdentityProfile(): void {
    const body = JSON.parse(this.body ?? '{}') as Record<string, unknown>;

    delete body.profile;
    this.body = JSON.stringify(body);
  }

  @given(
    'I set a client-signed identity update body with name {string}, handle {string} and password {string}',
  )
  public async iSetAClientSignedIdentityUpdateBody(
    name: string,
    handle: string,
    _password: string,
  ): Promise<void> {
    const previousIdentityExternalIdentifier =
      await this.findCreatedIdentityExternalIdentifier();

    await this.buildClientSignedIdentityBody(
      name,
      handle,
      2,
      previousIdentityExternalIdentifier,
    );
  }

  @given('I sign the current identity update request')
  public async iSignTheCurrentIdentityUpdateRequest(): Promise<void> {
    if (!this.createdIdentityId) {
      throw new Error('Identity must be created first.');
    }

    await this.signCurrentRequest(
      'PUT',
      `/identities/${encodeURIComponent(this.createdIdentityId)}`,
    );
  }

  @given('I sign a PUT request for the current identity')
  public async iSignAPUTRequestForTheCurrentIdentity(): Promise<void> {
    await this.signCurrentRequest('PUT', await this.currentIdentityPath());
  }

  @given('I sign the current presence update request')
  public async iSignTheCurrentPresenceUpdateRequest(): Promise<void> {
    await this.signCurrentRequest('PUT', '/presence/me');
  }

  @given('I sign the current link preview request')
  public async iSignTheCurrentLinkPreviewRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/link-previews');
  }

  @given('I sign the current presence list request')
  public async iSignTheCurrentPresenceListRequest(): Promise<void> {
    this.body = undefined;
    await this.ensureIdentityKeyPair();
    await this.signCurrentRequest('GET', '/presence');
  }

  @given('I sign the current identity presence request')
  public async iSignTheCurrentIdentityPresenceRequest(): Promise<void> {
    this.body = undefined;
    await this.ensureIdentityKeyPair();
    await this.signCurrentRequest(
      'GET',
      `/presence/${encodeURIComponent(this.ownerIdentityId?.valueOf() || '')}`,
    );
  }

  @given('another identity signs the current identity presence request')
  public async anotherIdentitySignsTheCurrentIdentityPresenceRequest(): Promise<void> {
    const targetIdentityId = this.ownerIdentityId as IdentityId;
    const signer = await this.ensureOtherIdentityKeyPair();
    const signerIdentityId = this.otherIdentityId as IdentityId;
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/presence/${encodeURIComponent(targetIdentityId.valueOf())}`,
      String(Date.now()),
      signer,
      signerIdentityId,
    );
  }

  @given('another identity signs the current presence list request')
  public async anotherIdentitySignsTheCurrentPresenceListRequest(): Promise<void> {
    const signer = await this.ensureOtherIdentityKeyPair();
    const signerIdentityId = this.otherIdentityId as IdentityId;
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/presence',
      String(Date.now()),
      signer,
      signerIdentityId,
    );
  }

  @given('I have published a keychain for the authenticated identity')
  public async iHavePublishedAKeychainForTheAuthenticatedIdentity(): Promise<void> {
    this.body = JSON.stringify({
      encryptedPayload: 'encrypted-keychain-payload',
      previousKeychainExternalIdentifier: null,
      timestamp: 1773848829055,
      version: 1,
    });

    await this.iSignTheCurrentKeychainPublicationRequest();
    this.response = await this.restClient.post(
      '/keychains',
      JSON.parse(this.body),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not publish keychain: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.keychainExternalIdentifier =
      this.response.data.keychainExternalIdentifier;
  }

  @given('I set a non-JSON body with content type {string}')
  public iSetANonJsonBodyWithContentType(contentType: string): void {
    this.body = undefined;
    this.binaryBody = Buffer.from('plain text body');
    this.headers['content-type'] = contentType;
  }

  @given('I set a one-to-one conversation body with a malformed participant')
  public async iSetAOneToOneConversationBodyWithAMalformedParticipant(): Promise<void> {
    await this.iSetAOneToOneConversationBodyForANewParticipant();
    const body = JSON.parse(this.body as string) as {
      participantIds: string[];
    };
    body.participantIds[1] = 'not-a-public-key';
    this.body = JSON.stringify(body);
  }

  @given('I set a one-to-one conversation body for a new participant')
  public async iSetAOneToOneConversationBodyForANewParticipant(): Promise<void> {
    if (!this.keychainExternalIdentifier) {
      throw new Error('Keychain must be published first.');
    }

    const participantKeyPair = await KeyPair.generate();
    const participantIdentityId = new IdentityId(
      participantKeyPair.toPrimitives().publicKey,
    );

    this.otherIdentityKeyPair = participantKeyPair;
    this.otherIdentityId = participantIdentityId;

    const ownerIdentityId = this.ownerIdentityId as IdentityId;

    this.body = JSON.stringify({
      keychainExternalIdentifier: this.keychainExternalIdentifier,
      networkId: this.currentNetworkId,
      participantIds: [
        ownerIdentityId.valueOf(),
        participantIdentityId.valueOf(),
      ],
      type: 'one-to-one',
    });
  }

  @given('I set a group conversation body for new participants')
  public async iSetAGroupConversationBodyForNewParticipants(): Promise<void> {
    if (!this.keychainExternalIdentifier) {
      throw new Error('Keychain must be published first.');
    }

    const firstParticipantKeyPair = await KeyPair.generate();
    const secondParticipantKeyPair = await KeyPair.generate();
    const firstParticipantIdentityId = new IdentityId(
      firstParticipantKeyPair.toPrimitives().publicKey,
    );
    const secondParticipantIdentityId = new IdentityId(
      secondParticipantKeyPair.toPrimitives().publicKey,
    );
    const ownerIdentityId = this.ownerIdentityId as IdentityId;

    this.otherIdentityKeyPair = firstParticipantKeyPair;
    this.otherIdentityId = firstParticipantIdentityId;

    this.body = JSON.stringify({
      keychainExternalIdentifier: this.keychainExternalIdentifier,
      name: 'api-group',
      networkId: this.currentNetworkId,
      participantIds: [
        ownerIdentityId.valueOf(),
        firstParticipantIdentityId.valueOf(),
        secondParticipantIdentityId.valueOf(),
      ],
      type: 'group',
    });
  }

  @given('I set a private community body')
  public iSetAPrivateCommunityBody(): void {
    this.body = JSON.stringify({
      autoJoinEnabled: false,
      avatar: 'bafybeigcommunityavatar',
      banner: 'bafybeigcommunitybanner',
      description: 'Private API community',
      discoverable: true,
      name: 'API community',
      networkId: this.currentNetworkId,
    });
  }

  @given('I set a public community body')
  public iSetAPublicCommunityBody(): void {
    this.body = JSON.stringify({
      autoJoinEnabled: false,
      avatar: 'bafybeigcommunityavatar',
      banner: 'bafybeigcommunitybanner',
      description: 'Public API community',
      discoverable: true,
      name: 'Public API community',
      networkId: this.currentNetworkId,
      visibility: 'public',
    });
  }

  @given('I set an auto-join private community body')
  public iSetAnAutoJoinPrivateCommunityBody(): void {
    this.body = JSON.stringify({
      autoJoinEnabled: true,
      avatar: 'bafybeigcommunityavatar',
      banner: 'bafybeigcommunitybanner',
      description: 'Private API community',
      discoverable: true,
      name: 'API community',
      networkId: this.currentNetworkId,
    });
  }

  @given('I set a hidden private community body')
  public iSetAHiddenPrivateCommunityBody(): void {
    this.body = JSON.stringify({
      autoJoinEnabled: false,
      avatar: 'bafybeigcommunityavatar',
      banner: 'bafybeigcommunitybanner',
      description: 'Private API community',
      discoverable: false,
      name: 'API community',
      networkId: this.currentNetworkId,
    });
  }

  @given('I set a community profile body with empty channel lists')
  public iSetACommunityProfileBodyWithEmptyChannelLists(): void {
    this.body = JSON.stringify({
      autoJoinEnabled: false,
      avatar: 'bafybeigcommunityavatarupdated',
      banner: 'bafybeigcommunitybannerupdated',
      description: 'Updated private API community',
      discoverable: true,
      name: 'Updated API community',
      textChannels: [],
      voiceChannels: [],
    });
  }

  @given('I set a community profile body enabling auto join')
  public iSetACommunityProfileBodyEnablingAutoJoin(): void {
    this.body = JSON.stringify({
      autoJoinEnabled: true,
      avatar: 'bafybeigcommunityavatarupdated',
      banner: 'bafybeigcommunitybannerupdated',
      description: 'Updated private API community',
      discoverable: true,
      name: 'Updated API community',
    });
  }

  @given('I sign the current community creation request')
  public async iSignTheCurrentCommunityCreationRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/communities');
  }

  @given('I remember the current community')
  public iRememberTheCurrentCommunity(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community response id not found.');
    }

    this.communityId = this.response.data.id;
  }

  @given('I remember the current community membership request')
  public iRememberTheCurrentCommunityMembershipRequest(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community membership request id not found.');
    }

    this.communityMembershipRequestId = this.response.data.id;
    this.communityMembershipRequest = this.response.data;
  }

  @given('I remember the current community role')
  public iRememberTheCurrentCommunityRole(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community role response id not found.');
    }

    this.communityRoleId = this.response.data.id;
  }

  @given('I set a community administrator role body')
  public iSetACommunityAdministratorRoleBody(): void {
    this.body = JSON.stringify({
      name: 'admin',
      permissions: [
        'approve_members',
        'create_invites',
        'manage_channels',
        'manage_messages',
        'manage_roles',
        'reject_members',
      ],
    });
  }

  @given('I set a community member manager role body')
  public iSetACommunityMemberManagerRoleBody(): void {
    this.body = JSON.stringify({
      name: 'member manager',
      permissions: ['manage_members'],
    });
  }

  @given('I set community member roles body with the current role')
  public iSetCommunityMemberRolesBodyWithTheCurrentRole(): void {
    if (!this.communityRoleId) {
      throw new Error('Community role must be created first.');
    }

    this.body = JSON.stringify({
      roleIds: [this.communityRoleId],
    });
  }

  @given('I set a community ban body for another identity')
  public async iSetACommunityBanBodyForAnotherIdentity(): Promise<void> {
    await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      identityId: this.otherIdentityId?.valueOf(),
    });
  }

  @given('I set current community channel visible for the current role')
  public iSetCurrentCommunityChannelVisibleForTheCurrentRole(): void {
    if (!this.communityRoleId) {
      throw new Error('Community role must be created first.');
    }

    this.body = JSON.stringify({
      visibleRoleIds: [this.communityRoleId],
    });
  }

  @given('I sign the current community role request')
  public async iSignTheCurrentCommunityRoleRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/roles`,
    );
  }

  @given('I sign the current community member roles request')
  public async iSignTheCurrentCommunityMemberRolesRequest(): Promise<void> {
    if (!this.communityId || !this.otherIdentityId) {
      throw new Error('Community and member must be available first.');
    }

    await this.signCurrentRequest(
      'PUT',
      `/communities/${this.communityId}/members/${encodeURIComponent(
        this.otherIdentityId.valueOf(),
      )}/roles`,
    );
  }

  @given('I sign the current community ban request')
  public async iSignTheCurrentCommunityBanRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/bans`,
    );
  }

  @given('I set a community invitation body with {int} uses')
  public iSetACommunityInvitationBodyWithUses(maxUses: number): void {
    const { key } = CommunityInvitationKey.generate();

    this.communityInvitationKey = key;
    this.body = JSON.stringify({
      expiresAt: Date.now() + 86_400_000,
      invitationKey: key.publicKey(),
      maxUses,
    });
  }

  @given('I sign the current community invitation request')
  public async iSignTheCurrentCommunityInvitationRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/invitations`,
    );
  }

  @given('I remember the current community invitation')
  public iRememberTheCurrentCommunityInvitation(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community invitation response id not found.');
    }

    this.communityInvitationId = this.response.data.id;
  }

  @given('I sign the current community invitations request')
  public async iSignTheCurrentCommunityInvitationsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/invitations`,
    );
  }

  @given('I sign the current community invitation claims request')
  public async iSignTheCurrentCommunityInvitationClaimsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/invitation-claims`,
    );
  }

  /** The other identity proves it holds the link and consents to join. */
  @given('the other identity signs a claim of the current community invitation')
  public async theOtherIdentitySignsAClaimOfTheCurrentCommunityInvitation(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityInvitationId ||
      !this.communityInvitationKey
    ) {
      throw new Error('Community invitation must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();
    const identityId = String(this.otherIdentityId?.valueOf());
    const fields: CommunityInvitationFields = {
      communityId: this.communityId,
      identityId,
      invitationId: this.communityInvitationId,
      networkId: String(this.currentNetworkId),
    };
    const proofs = {
      consent: CommunityInvitationConsent.sign(
        fields,
        new PrivateKey(keyPair.toPrimitives().privateKey),
      ),
      possession: this.communityInvitationKey.signPossession(fields),
    };
    const payload = {
      communityId: this.communityId,
      ...proofs,
      id: `invitation-claim:${this.communityInvitationId}:${identityId}`,
      identityId,
      invitationId: this.communityInvitationId,
      scopeType: 'community_invitation_claim',
    };

    this.communityInvitationProofs = proofs;
    this.body = JSON.stringify({
      ...proofs,
      mutation: this.signCommunityRecord(
        payload,
        keyPair,
        undefined,
        'requests',
        await this.communityFrontier(this.communityId),
      ),
    });
    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/invitations/${encodeURIComponent(this.communityInvitationId)}/claims`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the admission of the other identity to the current community')
  public async iSignTheAdmissionOfTheOtherIdentityToTheCurrentCommunity(): Promise<void> {
    if (!this.communityInvitationId || !this.communityInvitationProofs) {
      throw new Error('Community invitation must be claimed first.');
    }

    this.body = JSON.stringify({
      ...this.communityInvitationProofs,
      identityId: this.otherIdentityId?.valueOf(),
    });
    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/invitations/${encodeURIComponent(this.communityInvitationId)}/admissions`,
    );
  }

  @given('I sign the revocation of the current community invitation')
  public async iSignTheRevocationOfTheCurrentCommunityInvitation(): Promise<void> {
    if (!this.communityInvitationId) {
      throw new Error('Community invitation must be created first.');
    }

    this.body = '{}';
    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/invitations/${encodeURIComponent(this.communityInvitationId)}/revocation`,
    );
  }

  @given('I sign the current community kick request for another identity')
  public async iSignTheCurrentCommunityKickRequestForAnotherIdentity(): Promise<void> {
    if (!this.communityId || !this.otherIdentityId) {
      throw new Error('Community and kicked identity must be available first.');
    }

    this.body = '{}';
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/members/${encodeURIComponent(
        this.otherIdentityId.valueOf(),
      )}`,
    );
  }

  @given('I sign the current community role update request')
  public async iSignTheCurrentCommunityRoleUpdateRequest(): Promise<void> {
    if (!this.communityId || !this.communityRoleId) {
      throw new Error('Community and role must be created first.');
    }

    await this.signCurrentRequest(
      'PATCH',
      `/communities/${this.communityId}/roles/${this.communityRoleId}`,
    );
  }

  @given('I sign the current community role deletion request')
  public async iSignTheCurrentCommunityRoleDeletionRequest(): Promise<void> {
    if (!this.communityId || !this.communityRoleId) {
      throw new Error('Community and role must be created first.');
    }

    this.body = '{}';
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/roles/${this.communityRoleId}`,
    );
  }

  @given('I sign the current community unban request for another identity')
  public async iSignTheCurrentCommunityUnbanRequestForAnotherIdentity(): Promise<void> {
    if (!this.communityId || !this.otherIdentityId) {
      throw new Error('Community and banned identity must be available first.');
    }

    this.body = '{}';
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/bans/${encodeURIComponent(
        this.otherIdentityId.valueOf(),
      )}`,
    );
  }

  @given('I sign the current community channel permissions request')
  public async iSignTheCurrentCommunityChannelPermissionsRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    await this.signCurrentRequest(
      'PATCH',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/permissions`,
    );
  }

  @given('I set an accepted community membership request body')
  public iSetAnAcceptedCommunityMembershipRequestBody(): void {
    this.body = JSON.stringify({
      status: 'accepted',
    });
  }

  @given('I set a declined community membership request body')
  public iSetADeclinedCommunityMembershipRequestBody(): void {
    this.body = JSON.stringify({
      status: 'declined',
    });
  }

  @given('the community member signs the current communities request')
  public async theCommunityMemberSignsTheCurrentCommunitiesRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/communities',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the community membership requests request')
  public async theCommunityMemberSignsTheCommunityMembershipRequestsRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/community-membership-requests',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community discovery request')
  public async theCommunityMemberSignsTheCurrentCommunityDiscoveryRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/discoverable-communities',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community request')
  public async theCommunityMemberSignsTheCurrentCommunityRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community frontier request')
  public async theCommunityMemberSignsTheCurrentCommunityFrontierRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/frontier`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community operations request')
  public async theCommunityMemberSignsTheCurrentCommunityOperationsRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/operations`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community leave request')
  public async theCommunityMemberSignsTheCurrentCommunityLeaveRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/members/me`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community join request')
  public async theCommunityMemberSignsTheCurrentCommunityJoinRequest(): Promise<void> {
    await this.signCommunityJoinRequest(Date.now());
  }

  @given(
    'the community member signs the current community join request with a far-future createdAt',
  )
  public async theCommunityMemberSignsTheCurrentCommunityJoinRequestWithAFarFutureCreatedAt(): Promise<void> {
    // The largest millisecond timestamp still inside the Timestamp range.
    await this.signCommunityJoinRequest(Date.UTC(275000, 0, 1));
  }

  private async signCommunityJoinRequest(createdAt: number): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();
    const identityId = String(this.otherIdentityId?.valueOf());
    const payload = this.communityRequestPayload(
      identityId,
      identityId,
      createdAt,
    );
    const acceptedAt = createdAt + 1;

    this.body = JSON.stringify({
      acceptedAt,
      acceptedMutation: this.signCommunityRecord(
        { ...payload, status: 'accepted', updatedAt: acceptedAt },
        keyPair,
        1,
      ),
      communityId: this.communityId,
      createdAt,
      mutation: this.signCommunityRecord(payload, keyPair),
    });
    await this.signCurrentRequest(
      'POST',
      '/community-membership-requests',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community members request')
  public async theCommunityMemberSignsTheCurrentCommunityMembersRequest(): Promise<void> {
    await this.signOtherIdentityGet(this.currentCommunityPath('members'));
  }

  @given('the community member signs the current community roles request')
  public async theCommunityMemberSignsTheCurrentCommunityRolesRequest(): Promise<void> {
    await this.signOtherIdentityGet(this.currentCommunityPath('roles'));
  }

  @given('the community member signs the current community channels request')
  public async theCommunityMemberSignsTheCurrentCommunityChannelsRequest(): Promise<void> {
    await this.signOtherIdentityGet(this.currentCommunityPath('channels'));
  }

  @given('the community member signs the current community invitations request')
  public async theCommunityMemberSignsTheCurrentCommunityInvitationsRequest(): Promise<void> {
    await this.signOtherIdentityGet(this.currentCommunityPath('invitations'));
  }

  @given(
    'the community member signs the current community invitation claims request',
  )
  public async theCommunityMemberSignsTheCurrentCommunityInvitationClaimsRequest(): Promise<void> {
    await this.signOtherIdentityGet(
      this.currentCommunityPath('invitation-claims'),
    );
  }

  @given(
    'the community member signs the current community channel pins request',
  )
  public async theCommunityMemberSignsTheCurrentCommunityChannelPinsRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    await this.signOtherIdentityGet(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/pins`,
    );
  }

  @given('the community member signs the current community drafts request')
  public async theCommunityMemberSignsTheCurrentCommunityDraftsRequest(): Promise<void> {
    await this.signOtherIdentityGet('/community-drafts');
  }

  private currentCommunityPath(suffix: string): string {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    return `/communities/${this.communityId}/${suffix}`;
  }

  private async signOtherIdentityGet(path: string): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      path,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current membership request update')
  public async theCommunityMemberSignsTheCurrentMembershipRequestUpdate(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signMembershipRequestUpdate(keyPair, this.otherIdentityId);
  }

  @given('I sign the current community membership requests request')
  public async iSignTheCurrentCommunityMembershipRequestsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/community-membership-requests');
  }

  @given('I sign the current membership request update')
  public async iSignTheCurrentMembershipRequestUpdate(): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();

    await this.signMembershipRequestUpdate(keyPair);
  }

  @given('I sign the current community leave request')
  public async iSignTheCurrentCommunityLeaveRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/members/me`,
    );
  }

  @given('I sign the current community request')
  public async iSignTheCurrentCommunityRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest('GET', `/communities/${this.communityId}`);
  }

  @given('I sign the current community profile update request')
  public async iSignTheCurrentCommunityProfileUpdateRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest('PATCH', `/communities/${this.communityId}`);
  }

  @given('I sign the current community moderation logs request')
  public async iSignTheCurrentCommunityModerationLogsRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/moderation-logs`,
    );
  }

  @given(
    'the community member signs the current community moderation logs request',
  )
  public async theCommunityMemberSignsTheCurrentCommunityModerationLogsRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/moderation-logs`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current community operations request')
  public async iSignTheCurrentCommunityOperationsRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/operations`,
    );
  }

  @given('I set a community text channel body')
  public iSetACommunityTextChannelBody(): void {
    this.body = JSON.stringify({
      name: 'general',
      type: 'text',
    });
  }

  @given('I set a community voice channel body')
  public iSetACommunityVoiceChannelBody(): void {
    this.body = JSON.stringify({
      name: 'voice',
      type: 'voice',
    });
  }

  @given('I sign the current community text channel request')
  public async iSignTheCurrentCommunityTextChannelRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels`,
    );
  }

  @given('I sign the current community voice channel request')
  public async iSignTheCurrentCommunityVoiceChannelRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels`,
    );
  }

  @given('another identity signs the current community text channel request')
  public async anotherIdentitySignsTheCurrentCommunityTextChannelRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I remember the current community text channel')
  public iRememberTheCurrentCommunityTextChannel(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community channel response id not found.');
    }

    this.communityChannelId = this.response.data.id;
    this.communityChannelType = 'text';
  }

  @given('I remember the current community voice channel')
  public iRememberTheCurrentCommunityVoiceChannel(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community channel response id not found.');
    }

    this.communityChannelId = this.response.data.id;
    this.communityChannelType = 'voice';
  }

  @given('I set a community text channel rename body')
  public iSetACommunityTextChannelRenameBody(): void {
    this.body = JSON.stringify({
      name: 'announcements',
    });
  }

  @given('I sign the current community text channel rename request')
  public async iSignTheCurrentCommunityTextChannelRenameRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    await this.signCurrentRequest(
      'PATCH',
      `/communities/${this.communityId}/channels/${this.communityChannelId}`,
    );
  }

  @given('I sign the current community channel deletion request')
  public async iSignTheCurrentCommunityChannelDeletionRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = '{}';
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/channels/${this.communityChannelId}`,
    );
  }

  @given(
    'another identity signs the current community channel deletion request',
  )
  public async anotherIdentitySignsTheCurrentCommunityChannelDeletionRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = '{}';
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/channels/${this.communityChannelId}`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current community channels request')
  public async iSignTheCurrentCommunityChannelsRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/channels`,
    );
  }

  @given('I set an encrypted community channel message body')
  public async iSetAnEncryptedCommunityChannelMessageBody(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = JSON.stringify(
      await this.communityMessageBody({
        encryptedPayload: 'encrypted-community-channel-message-payload',
      }),
    );
  }

  @given('I set an encrypted community channel reply body')
  public async iSetAnEncryptedCommunityChannelReplyBody(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    this.body = JSON.stringify(
      await this.communityMessageBody({
        encryptedPayload: 'encrypted-community-channel-reply-payload',
        replyToMessageId: this.communityChannelMessageId,
      }),
    );
  }

  @given('I remember the current community channel message as thread root')
  public iRememberTheCurrentCommunityChannelMessageAsThreadRoot(): void {
    if (!this.communityChannelMessageId) {
      throw new Error('Community channel message must be created first.');
    }

    this.communityThreadRootMessageId = this.communityChannelMessageId;
  }

  @given('I restore the remembered community channel thread root message')
  public iRestoreTheRememberedCommunityChannelThreadRootMessage(): void {
    if (!this.communityThreadRootMessageId) {
      throw new Error(
        'Community channel thread root must be remembered first.',
      );
    }

    this.communityChannelMessageId = this.communityThreadRootMessageId;
  }

  @given('I set a plaintext community channel message body')
  public async iSetAPlaintextCommunityChannelMessageBody(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = JSON.stringify(
      await this.communityMessageBody({
        plaintextPayload: 'plain public searchable community message',
      }),
    );
  }

  @given(
    'I set an encrypted community channel message body mentioning everyone',
  )
  public async iSetAnEncryptedCommunityChannelMessageBodyMentioningEveryone(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = JSON.stringify(
      await this.communityMessageBody({
        encryptedPayload: 'encrypted-community-channel-message-payload',
        mentions: [{ type: 'everyone' }],
      }),
    );
  }

  @given('I set a delete community channel message body')
  public async iSetADeleteCommunityChannelMessageBody(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    const record = this.communityMessageRecord(this.communityChannelMessageId);

    this.body = JSON.stringify({
      mutation: await this.communityMessageMutation(
        {
          authorIdentityId: record.authorIdentityId,
          channelId: record.channelId,
          communityId: record.communityId,
          id: record.id,
          messageId: record.messageId,
          removed: true,
          scopeType: 'community_channel',
        },
        'delete',
        2,
      ),
    });
  }

  @given('I set an edit community channel message body')
  public async iSetAnEditCommunityChannelMessageBody(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    const editedAt = Date.now();
    const record = {
      ...this.communityMessageRecord(this.communityChannelMessageId),
      editedAt,
      encryptedPayload: 'edited-community-channel-message-payload',
      mentions: [] as unknown[],
      type: 'sent',
    };

    this.body = JSON.stringify({
      createdAt: editedAt,
      encryptedPayload: 'edited-community-channel-message-payload',
      mutation: await this.communityMessageMutation(record, 'put', 1),
    });
  }

  @given('I sign the current community channel message request')
  public async iSignTheCurrentCommunityChannelMessageRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
    );
  }

  @given('I sign the current community channel messages request')
  public async iSignTheCurrentCommunityChannelMessagesRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
    );
  }

  @given(
    'the community member signs the current community channel messages request',
  )
  public async theCommunityMemberSignsTheCurrentCommunityChannelMessagesRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current community channel message search request')
  public async iSignTheCurrentCommunityChannelMessageSearchRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
    );
  }

  @given('I sign the current community message search request')
  public async iSignTheCurrentCommunityMessageSearchRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/messages`,
    );
  }

  @given('I sign the current community channel message deletion request')
  public async iSignTheCurrentCommunityChannelMessageDeletionRequest(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}`,
    );
  }

  @given('I sign the current community channel message edition request')
  public async iSignTheCurrentCommunityChannelMessageEditionRequest(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    await this.signCurrentRequest(
      'PUT',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}`,
    );
  }

  private async communityReactionMutationBody(
    kind: 'put' | 'delete',
  ): Promise<string> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const emoji = '👍';
    const createdAt = 1_780_000_000_000;
    const recordId = [
      'community_channel',
      this.communityId,
      this.communityChannelId,
      this.communityChannelMessageId,
      identityId,
      emoji,
    ].join(':');
    const document = {
      authorIdentityId: identityId,
      channelId: this.communityChannelId,
      communityId: this.communityId,
      emoji,
      id: recordId,
      messageId: this.communityChannelMessageId,
      scopeType: 'community_channel',
    };
    const payload =
      kind === 'put'
        ? { ...document, createdAt }
        : { ...document, removed: true };
    const sequence = kind === 'put' ? 0 : 1;
    const proofBody = {
      author: {
        authorizationRevision: 0,
        deviceCredential: identityId,
        identityId,
      },
      kind,
      operationId: `api-reaction-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId,
      sequence,
      store: 'reactions',
      version: 2,
    } as const;
    const proof = PublicMutationProof.signed(
      proofBody,
      keyPair.sign(PublicMutationProof.signingContentOf(proofBody)),
    );

    return JSON.stringify({
      ...(kind === 'put' ? { createdAt } : {}),
      emoji,
      mutation: proof.toPrimitives(),
    });
  }

  @given('I set a community channel message reaction body')
  public async iSetACommunityChannelMessageReactionBody(): Promise<void> {
    this.body = await this.communityReactionMutationBody('put');
  }

  @given('I sign the current community channel message reaction request')
  public async iSignTheCurrentCommunityChannelMessageReactionRequest(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}/reactions`,
    );
  }

  @given(
    'I sign the current community channel message reaction removal request',
  )
  public async iSignTheCurrentCommunityChannelMessageReactionRemovalRequest(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    this.body = await this.communityReactionMutationBody('delete');
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}/reactions`,
    );
  }

  @given('I sign the current one-to-one conversation request')
  public async iSignTheCurrentOneToOneConversationRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/conversations');
  }

  /** Signs the group genesis an older client sent, a shape nodes now refuse. */
  @given('I sign the current group conversation request as an older client did')
  public async iSignTheCurrentGroupConversationRequestAsAnOlderClientDid(): Promise<void> {
    const body = JSON.parse(this.body ?? '{}');
    const keyPair = await this.resolveSignerKeyPair(undefined);
    const identityId = new IdentityId(
      keyPair.toPrimitives().publicKey,
    ).valueOf();
    const createdAt = Date.now();
    const nonce = randomUUID();
    const record = legacyGroupGenesis({
      createdAt,
      creatorIdentityId: identityId,
      name: body.name,
      networkId: String(body.networkId),
      nonce,
      participantIds: [...new Set([identityId, ...body.participantIds])],
    });
    const proof = signConversationOperationRecord(record, {
      deviceCredential: keyPair.toPrimitives().publicKey,
      deviceKeyPair: keyPair,
      id: identityId,
    });

    this.body = JSON.stringify({
      ...body,
      nonce,
      operation: { createdAt, mutation: proof.toPrimitives(), parents: [] },
    });
    await this.signCurrentRequest('POST', '/conversations');
  }

  @given('I have created a one-to-one conversation')
  public async iHaveCreatedAOneToOneConversation(): Promise<void> {
    await this.iHavePublishedAKeychainForTheAuthenticatedIdentity();
    await this.iSetAOneToOneConversationBodyForANewParticipant();
    await this.iSignTheCurrentOneToOneConversationRequest();

    this.response = await this.restClient.post(
      '/conversations',
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not create conversation: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.conversationId = this.response.data.id;
  }

  @given('I set a conversation member body for a new identity')
  public async iSetAConversationMemberBodyForANewIdentity(): Promise<void> {
    const keyPair = await KeyPair.generate();

    this.body = JSON.stringify({
      identityId: new IdentityId(keyPair.toPrimitives().publicKey).valueOf(),
    });
  }

  /** `{other}` in the path stands for the other identity; the body is kept for POST only. */
  @given(
    'the {word} signs a {word} request to the current conversation path {string}',
  )
  public async theIdentitySignsAConversationRequest(
    signer: string,
    method: string,
    suffix: string,
  ): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    const isOther = signer === 'other';
    const keyPair = await (isOther
      ? this.ensureOtherIdentityKeyPair()
      : this.ensureIdentityKeyPair());
    const identityIds = {
      '{other}': this.otherIdentityId?.valueOf() ?? '',
      '{owner}': this.ownerIdentityId?.valueOf() ?? '',
    };
    const path = Object.entries(identityIds).reduce(
      (current, [token, identityId]) =>
        current.replace(token, encodeURIComponent(identityId)),
      `/conversations/${this.conversationId}${suffix}`,
    );

    this.body = method === 'POST' ? this.body : undefined;
    this.signedConversationRequest = { method, path };
    await this.signCurrentRequest(
      method,
      path,
      String(Date.now()),
      keyPair,
      isOther ? this.otherIdentityId : undefined,
    );
  }

  @given('I set a conversation call body')
  public iSetAConversationCallBody(): void {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    this.body = JSON.stringify({
      conversationId: this.conversationId,
      scopeType: 'conversation',
    });
  }

  @given('I set a community channel call body')
  public iSetACommunityChannelCallBody(): void {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = JSON.stringify({
      channelId: this.communityChannelId,
      communityId: this.communityId,
      scopeType: 'community_channel',
    });
  }

  @given('I set a community channel call body with an outside invitee')
  public iSetACommunityChannelCallBodyWithAnOutsideInvitee(): void {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = JSON.stringify({
      channelId: this.communityChannelId,
      communityId: this.communityId,
      invitedParticipantIds: [
        'MCowBQYDK2VwAyEAA0YLLSFyAaDRgmbqSTJ2gTeRCJq6QfP9RNHHp0/qbtY=',
      ],
      scopeType: 'community_channel',
    });
  }

  @given('I set a group capability call body')
  public iSetAGroupCapabilityCallBody(): void {
    this.body = JSON.stringify({
      capabilityHash: createHash('sha256')
        .update(GROUP_CALL_CAPABILITY)
        .digest('hex'),
      networkId: this.currentNetworkId,
      scopeType: 'group_capability',
    });
  }

  @given('I present the group call capability')
  public iPresentTheGroupCallCapability(): void {
    this.headers.authorization = `Bearer ${GROUP_CALL_CAPABILITY}`;
  }

  @given('I present another group call capability')
  public iPresentAnotherGroupCallCapability(): void {
    this.headers.authorization = `Bearer ${GROUP_CALL_CAPABILITY.split('').reverse().join('')}`;
  }

  @given('I present no group call capability')
  public iPresentNoGroupCallCapability(): void {
    delete this.headers.authorization;
  }

  @given('call requests are sent without a mutation')
  public callRequestsAreSentWithoutAMutation(): void {
    this.callMutationDisabled = true;
  }

  @given('I remember the current call')
  public iRememberTheCurrentCall(): void {
    if (!this.response?.data?.id) {
      throw new Error('Call response id not found.');
    }

    this.callId = this.response.data.id;
  }

  @given('I set a call signal body for the other identity')
  public iSetACallSignalBodyForTheOtherIdentity(): void {
    if (!this.otherIdentityId) {
      throw new Error('Other identity must exist first.');
    }

    this.body = JSON.stringify({
      payload: {
        sdp: 'api-offer-sdp',
      },
      recipientIdentityId: this.otherIdentityId.valueOf(),
      signalType: 'offer',
    });
  }

  @given('I set a call signal body for an unrelated identity')
  public async iSetACallSignalBodyForAnUnrelatedIdentity(): Promise<void> {
    const unrelatedKeyPair = await KeyPair.generate();
    const unrelatedIdentityId = new IdentityId(
      unrelatedKeyPair.toPrimitives().publicKey,
    );

    this.body = JSON.stringify({
      payload: {
        sdp: 'api-offer-sdp',
      },
      recipientIdentityId: unrelatedIdentityId.valueOf(),
      signalType: 'offer',
    });
  }

  @given('I sign the current call start request')
  public async iSignTheCurrentCallStartRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/calls');
  }

  @given('the community member signs the current call start request')
  public async theCommunityMemberSignsTheCurrentCallStartRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/calls',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @when('both community members start the current call concurrently')
  public async bothCommunityMembersStartTheCurrentCallConcurrently(): Promise<void> {
    const base = this.body;

    await this.signCurrentRequest('POST', '/calls');
    const ownerHeaders = { ...this.headers };
    const ownerBody = JSON.parse(this.body || '{}');
    const otherIdentityKeyPair = await this.ensureOtherIdentityKeyPair();

    this.body = base;
    await this.signCurrentRequest(
      'POST',
      '/calls',
      String(Date.now()),
      otherIdentityKeyPair,
      this.otherIdentityId,
    );
    const otherHeaders = { ...this.headers };
    const otherBody = JSON.parse(this.body || '{}');

    this.concurrentCallResponses = await Promise.all([
      this.restClient.post('/calls', ownerBody, { headers: ownerHeaders }),
      this.restClient.post('/calls', otherBody, { headers: otherHeaders }),
    ]);
    this.response = this.concurrentCallResponses[0];
    this.callId = String(this.concurrentCallResponses[0].data.id);
    this.body = undefined;
    await this.signCurrentRequest('POST', `/calls/${this.callId}/participants`);
    await this.restClient.post(
      `/calls/${this.callId}/participants`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );
    this.body = undefined;
    await this.theOtherIdentitySignsTheCurrentCallJoinRequest();
    await this.restClient.post(
      `/calls/${this.callId}/participants`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );
  }

  @when('the current call heartbeat expires')
  public async theCurrentCallHeartbeatExpires(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await Kernel.di
      .getService<CallParticipantLeaseExpirationRegistrar>(
        CallParticipantLeaseExpirationRegistrar,
      )
      .expire();
  }

  @then('the current call has no live participants')
  public theCurrentCallHasNoLiveParticipants(): void {
    expect(this.response.data.participants).to.deep.equal([]);
    expect(this.response.data.participantIds).to.deep.equal([]);
  }

  @then('the current call does not list the other identity as a participant')
  public theCurrentCallDoesNotListTheOtherIdentity(): void {
    if (!this.otherIdentityId) {
      throw new Error('Other identity must be created first.');
    }

    expect(this.response.data.participantIds).to.not.include(
      this.otherIdentityId.valueOf(),
    );
  }

  @then('the current voice channel has {int} connected identities')
  public theCurrentVoiceChannelHasConnectedIdentities(count: number): void {
    const channels = this.response.data.channels;

    if (!Array.isArray(channels)) {
      throw new Error('Response must contain a channels array.');
    }
    const channel = channels.find(
      (candidate: { id: string }) => candidate.id === this.communityChannelId,
    );
    expect(channel)
      .to.have.property('connectedIdentityIds')
      .with.lengthOf(count);
  }

  @given('I sign the current calls request')
  public async iSignTheCurrentCallsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/calls');
  }

  @given('I sign the current call history request')
  public async iSignTheCurrentCallHistoryRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/past-calls');
  }

  @given('I sign the current call request')
  public async iSignTheCurrentCallRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest('GET', `/calls/${this.callId}`);
  }

  @given('calls use a test TURN server')
  public callsUseATestTurnServer(): void {
    delete process.env.CALLS_TURN_CREDENTIAL;
    delete process.env.CALLS_TURN_USERNAME;
    process.env.CALLS_TURN_CREDENTIAL_TTL_SECONDS = '600';
    process.env.CALLS_TURN_SHARED_SECRET = 'test-turn-secret';
    process.env.CALLS_TURN_URLS = 'turn:test-turn.local:3478?transport=udp';
  }

  @given('calls use a test TURN server without a custom shared secret')
  public callsUseATestTurnServerWithoutACustomSharedSecret(): void {
    delete process.env.CALLS_TURN_CREDENTIAL;
    delete process.env.CALLS_TURN_SHARED_SECRET;
    delete process.env.CALLS_TURN_USERNAME;
    process.env.CALLS_TURN_CREDENTIAL_TTL_SECONDS = '600';
    process.env.CALLS_TURN_URLS = 'turn:test-turn.local:3478?transport=udp';
  }

  @given('a remote TURN relay has been discovered for calls')
  public aRemoteTurnRelayHasBeenDiscoveredForCalls(): void {
    const callRelayRecordRegistry =
      Kernel.di.getService<CallRelayRecordRegistry>(CallRelayRecordRegistry);

    callRelayRecordRegistry.save({
      expiresAt: Date.now() + 60_000,
      issuedAt: Date.now(),
      peerId: '12D3KooWRemoteCallRelay',
      poolSignature: 'remote-pool-signature',
      publicKey: 'remote-public-key',
      role: 'call-relay',
      signature: 'remote-signature',
      urls: ['turn:remote-turn.local:3478?transport=udp'],
      version: 1,
    });
  }

  @given('I sign the current call ICE servers request')
  public async iSignTheCurrentCallIceServersRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/call-ice-servers');
  }

  @given('the other identity signs the current call join request')
  public async theOtherIdentitySignsTheCurrentCallJoinRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'POST',
      `/calls/${this.callId}/participants`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current call heartbeat request')
  public async iSignTheCurrentCallHeartbeatRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.body = JSON.stringify({ mediaConnections: [] });
    await this.signCurrentRequest(
      'PATCH',
      `/calls/${this.callId}/participants/me`,
    );
  }

  @given('the other identity signs the current call heartbeat request')
  public async theOtherIdentitySignsTheCurrentCallHeartbeatRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      mediaConnections: [
        {
          localCandidateType: 'relay',
          protocol: 'udp',
          relayProtocol: 'udp',
          relayUrl: 'turn:relay.example:3478?transport=udp',
          remoteCandidateType: 'relay',
          remoteIdentityId: this.ownerIdentityId?.valueOf(),
          state: 'connected',
        },
      ],
    });
    await this.signCurrentRequest(
      'PATCH',
      `/calls/${this.callId}/participants/me`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given(
    'the other identity signs a heartbeat reporting a media connection to a departed participant',
  )
  public async theOtherIdentitySignsAHeartbeatReportingAMediaConnectionToADepartedParticipant(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      mediaConnections: [
        {
          remoteIdentityId:
            'MCowBQYDK2VwAyEAKV3uU7LZg0grhngWKkoR9jqZo5M3yQ2GHliIFMgdJZw=',
          state: 'connected',
        },
      ],
    });
    await this.signCurrentRequest(
      'PATCH',
      `/calls/${this.callId}/participants/me`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current call end request')
  public async iSignTheCurrentCallEndRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest('DELETE', `/calls/${this.callId}`);
  }

  @given('the other identity signs the current call leave request')
  public async theOtherIdentitySignsTheCurrentCallLeaveRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'DELETE',
      `/calls/${this.callId}/participants/me`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current call signal request')
  public async iSignTheCurrentCallSignalRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    await this.signCurrentRequest('POST', `/calls/${this.callId}/signals`);
  }

  private communityMessageRecord(messageId: string): {
    authorIdentityId: string;
    channelId: string;
    communityId: string;
    createdAt: number;
    id: string;
    messageId: string;
    scopeType: string;
  } {
    const authorIdentityId = this.ownerIdentityId?.valueOf() || '';

    return {
      authorIdentityId,
      channelId: this.communityChannelId || '',
      communityId: this.communityId || '',
      createdAt: this.communityMessageCreatedAt,
      id: `community:${this.communityId}:${this.communityChannelId}:${messageId}:${authorIdentityId}`,
      messageId,
      scopeType: 'community_channel',
    };
  }

  private async communityMessageBody(
    fields: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const messageId = `community-message:${Date.now()}:${randomUUID()}`;

    this.communityMessageCreatedAt = Date.now();
    const record = {
      ...this.communityMessageRecord(messageId),
      mentions: [] as unknown[],
      ...fields,
      type: 'sent',
    };

    return {
      ...fields,
      createdAt: this.communityMessageCreatedAt,
      id: messageId,
      mutation: await this.communityMessageMutation(record, 'put', 0),
    };
  }

  private async communityMessageMutation(
    payload: Record<string, unknown>,
    kind: 'delete' | 'put',
    sequence: number,
  ): Promise<Record<string, unknown>> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const proofBody = {
      author: {
        authorizationRevision: 0,
        deviceCredential: identityId,
        identityId,
      },
      kind,
      operationId: `api-community-message-${kind}-${sequence}-${randomUUID()}`
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .slice(0, 64),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0
          ? (null as string | null)
          : PublicMutationProof.digestOf({ previous: sequence }),
      recordId: payload.id as string,
      sequence,
      store: 'messages',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      proofBody,
      keyPair.sign(PublicMutationProof.signingContentOf(proofBody)),
    ).toPrimitives() as unknown as Record<string, unknown>;
  }

  private async conversationMessageMutation(
    fields: Record<string, unknown> & { id: string },
  ): Promise<Record<string, unknown>> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const payload = {
      ...fields,
      authorId: identityId,
      scopeType: 'conversation',
    };
    const proofBody = {
      author: {
        authorizationRevision: 0,
        deviceCredential: identityId,
        identityId,
      },
      kind: 'put',
      operationId: `api-conversation-message-${fields.id}`
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .padEnd(22, '0')
        .slice(0, 64),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor: null as string | null,
      recordId: fields.id,
      sequence: 0,
      store: 'messages',
      version: 2,
    } as const;

    return PublicMutationProof.signed(
      proofBody,
      keyPair.sign(PublicMutationProof.signingContentOf(proofBody)),
    ).toPrimitives() as unknown as Record<string, unknown>;
  }

  private stickerDetailsOf(body: Record<string, unknown>) {
    return {
      assetCid: body.assetCid,
      contentType: body.contentType,
      dimensions: body.dimensions,
      sizeBytes: body.sizeBytes,
      type: body.type,
    };
  }

  private async signStickerMutation(
    store: 'stickerPacks' | 'stickerUserLibraries',
    kind: 'put' | 'delete',
    payload: Record<string, unknown>,
  ): Promise<ReturnType<PublicMutationProof['toPrimitives']>> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const recordId = String(payload.id);
    const sequence = this.stickerMutationSequences.get(recordId) ?? 0;
    const proofBody = {
      author: {
        authorizationRevision: 0,
        deviceCredential: identityId,
        identityId,
      },
      kind,
      operationId: `api-sticker-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0
          ? null
          : PublicMutationProof.digestOf({ previous: sequence - 1 }),
      recordId,
      sequence,
      store,
      version: 2,
    } as const;

    this.stickerMutationSequences.set(recordId, sequence + 1);

    return PublicMutationProof.signed(
      proofBody,
      keyPair.sign(PublicMutationProof.signingContentOf(proofBody)),
    ).toPrimitives();
  }

  private async withStickerPackMutation(
    packId: string,
    update: (pack: StickerPackDocument) => void,
    creation?: { createdAt: number },
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const at = creation?.createdAt ?? (this.stickerClock += 1);
    const pack: StickerPackDocument = this.stickerPackDocuments.get(packId) ?? {
      createdAt: at,
      id: packId,
      name: '',
      ownerIdentityId: keyPair.toPrimitives().publicKey,
      scopeType: 'sticker_pack',
      stickers: [],
      updatedAt: at,
    };

    update(pack);
    pack.updatedAt = at;
    this.stickerPackDocuments.set(packId, pack);
    this.body = JSON.stringify({
      ...JSON.parse(this.body || '{}'),
      ...(creation ? { ...creation, packId } : { updatedAt: at }),
      mutation: await this.signStickerMutation('stickerPacks', 'put', pack),
    });
  }

  private async withStickerLibraryMutation(
    kind: 'favorite' | 'saved' | 'recent',
    removed: boolean,
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const at = (this.stickerClock += 1);
    const base = {
      favorite: {
        id: `favorite:${identityId}:${this.stickerPackId}:${this.stickerId}`,
        identityId,
        packId: this.stickerPackId,
        scopeType: 'sticker_favorite',
        stickerId: this.stickerId,
      },
      recent: {
        id: `recent:${identityId}:${this.stickerPackId}:${this.stickerId}`,
        identityId,
        packId: this.stickerPackId,
        scopeType: 'sticker_recent',
        stickerId: this.stickerId,
      },
      saved: {
        id: `saved:${identityId}:${this.stickerPackId}`,
        identityId,
        packId: this.stickerPackId,
        scopeType: 'sticker_saved_pack',
      },
    }[kind];
    const timestamp = {
      favorite: { favoritedAt: at },
      recent: { usedAt: at },
      saved: { savedAt: at },
    }[kind];
    const mutation = await this.signStickerMutation(
      'stickerUserLibraries',
      removed ? 'delete' : 'put',
      removed ? { ...base, removed: true } : { ...base, ...timestamp },
    );

    this.body = JSON.stringify(
      removed ? { mutation } : { ...timestamp, mutation },
    );
  }

  private async withNotificationSettingsMutation(
    kind: 'put' | 'delete',
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const body = JSON.parse(this.body || '{}');
    const scope = NotificationSettingScope.fromPrimitives(body.scope);
    const recordId = `${identityId}:${scope.key()}`;
    const sequence = this.notificationSettingsSequences.get(recordId) ?? 0;
    const updatedAt = 1_780_000_000_000 + sequence;
    const base = {
      id: recordId,
      identityId,
      scopeKey: scope.key(),
      scopeType: 'notification_settings',
    };
    const payload =
      kind === 'put'
        ? {
            ...base,
            hideMutedChannels: body.hideMutedChannels ?? false,
            mobilePushEnabled: body.mobilePushEnabled ?? true,
            ...(body.mutedUntil === undefined
              ? {}
              : { mutedUntil: body.mutedUntil }),
            notificationLevel: body.notificationLevel,
            scope: scope.toPrimitives(),
            suppressEveryoneAndHere: body.suppressEveryoneAndHere ?? false,
            suppressRoleMentions: body.suppressRoleMentions ?? false,
            updatedAt,
          }
        : { ...base, removed: true };
    const proofBody = {
      author: {
        authorizationRevision: 0,
        deviceCredential: identityId,
        identityId,
      },
      kind,
      operationId: `api-notification-settings-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0
          ? null
          : PublicMutationProof.digestOf({ previous: sequence - 1 }),
      recordId,
      sequence,
      store: 'notificationSettings',
      version: 2,
    } as const;
    const proof = PublicMutationProof.signed(
      proofBody,
      keyPair.sign(PublicMutationProof.signingContentOf(proofBody)),
    );

    this.notificationSettingsSequences.set(recordId, sequence + 1);
    this.body = JSON.stringify({
      ...body,
      mutation: proof.toPrimitives(),
      ...(kind === 'put' ? { updatedAt } : {}),
    });
  }

  @given('I target an unknown conversation message')
  public iTargetAnUnknownConversationMessage(): void {
    this.messageId = randomUUID();
  }

  /** `{message}` in the path stands for the current message; GET drops the body. */
  @given(
    'I sign a {word} request to the current conversation message path {string}',
  )
  public async iSignARequestToTheCurrentConversationMessagePath(
    method: string,
    suffix: string,
  ): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    const path = `/conversations/${this.conversationId}${suffix.replace(
      '{message}',
      encodeURIComponent(this.messageId),
    )}`;

    this.body = method === 'GET' ? undefined : this.body;
    this.signedConversationRequest = { method, path };
    await this.signCurrentRequest(method, path);
  }

  /** GET and DELETE drop the body. */
  @given('I sign a {word} request to {string}')
  public async iSignARequestTo(method: string, path: string): Promise<void> {
    this.body = ['GET', 'DELETE'].includes(method) ? undefined : this.body;
    await this.signCurrentRequest(method, path);
  }

  /** GET and DELETE drop the body. */
  @given('another identity signs a {word} request to {string}')
  public async anotherIdentitySignsARequestTo(
    method: string,
    path: string,
  ): Promise<void> {
    const signer = await this.ensureOtherIdentityKeyPair();

    this.body = ['GET', 'DELETE'].includes(method) ? undefined : this.body;
    await this.signCurrentRequest(
      method,
      path,
      String(Date.now()),
      signer,
      this.otherIdentityId as IdentityId,
    );
  }

  @given('I sign the current identity keychain request')
  public async iSignTheCurrentIdentityKeychainRequest(): Promise<void> {
    if (!this.ownerIdentityId) {
      throw new Error('Authenticated identity must exist first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/keychains/${encodeURIComponent(this.ownerIdentityId.valueOf())}`,
    );
  }

  @given('I set raw IPFS content with content type {string} and text {string}')
  public iSetPublicIPFSContent(contentType: string, text: string): void {
    this.binaryBody = Buffer.from(text);
    this.headers['content-type'] = contentType;
    this.headers['x-filename'] = 'avatar.png';
  }

  @given(
    'I sign the current content replication registration for the published content',
  )
  public async iSignTheCurrentContentReplicationRegistration(): Promise<void> {
    await this.iSignTheCurrentContentReplicationRegistrationWithContext(
      'ipfs_public_upload',
    );
  }

  @given(
    'I sign the current content replication registration for the published content with context {string}',
  )
  public async iSignTheCurrentContentReplicationRegistrationWithContext(
    context: string,
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const cid = String(this.response?.data?.cid);
    const networkId = String(this.currentNetworkId);
    const payload = {
      cid,
      context,
      id: `content:${networkId}:${cid}`,
      networkId,
      ownerIdentityId: identityId,
      scopeType: 'content_replication',
      sizeBytes: 5,
    };

    this.body = JSON.stringify({
      context: payload.context,
      mutation: this.signCommunityRecord(
        payload,
        keyPair,
        undefined,
        'contentReplication',
      ),
      networkId,
      sizeBytes: payload.sizeBytes,
    });
    await this.ensureAuthenticatedIdentityIsPublished();
    this.binaryBody = undefined;
    this.headers['content-type'] = 'application/json';
    this.replicationCid = cid;
    await this.signCurrentRequest('PUT', `/ipfs/replications/${cid}`);
  }

  @when('I PUT the signed content replication registration')
  public async iPUTTheSignedContentReplicationRegistration(): Promise<void> {
    await this.iPUT(`/ipfs/replications/${this.replicationCid}`);
  }

  @given('I sign the current public IPFS content request')
  public async iSignTheCurrentPublicIPFSContentRequest(): Promise<void> {
    await this.ensureAuthenticatedIdentityIsPublished();
    await this.signCurrentRequest('POST', '/ipfs/contents');
  }

  @given('I sign the current network IPFS content request')
  public async iSignTheCurrentNetworkIPFSContentRequest(): Promise<void> {
    if (!this.currentNetworkId) {
      throw new Error('IPFS network must be registered first.');
    }

    await this.signCurrentRequest('POST', `/ipfs/${this.currentNetworkId}`);
  }

  @given('I sign the current content replication status request')
  @given('I sign the current IPFS replication status request')
  public async iSignTheCurrentContentReplicationStatusRequest(): Promise<void> {
    this.binaryBody = undefined;
    this.body = undefined;
    await this.signCurrentRequest('GET', '/ipfs/replication-status');
  }

  @given(
    'another identity signs the current content replication status request',
  )
  @given('another identity signs the current IPFS replication status request')
  public async anotherIdentitySignsTheCurrentContentReplicationStatusRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.binaryBody = undefined;
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/ipfs/replication-status',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current conversations request')
  public async iSignTheCurrentConversationsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/conversations');
  }

  @given('I sign the current conversations request with an expired timestamp')
  public async iSignTheCurrentConversationsRequestWithAnExpiredTimestamp(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/conversations',
      String(Date.now() - 31_000),
    );
  }

  @given('I sign the current node owner request')
  public async iSignTheCurrentNodeOwnerRequest(): Promise<void> {
    this.body = this.body ?? '{}';
    await this.signCurrentRequest('PUT', '/node/owner');
  }

  @given('I hand the node over to the other identity')
  public async iHandTheNodeOverToTheOtherIdentity(): Promise<void> {
    await this.ensureOtherIdentityKeyPair();
    this.body = JSON.stringify({ identityId: this.otherIdentityId });
    await this.signCurrentRequest('PUT', '/node/owner');
    await this.iPUT('/node/owner');
    expect(this.response.status).to.equal(200);
  }

  @then(
    'an unauthenticated sealed secrets read of the other identity answers like one of an unblocked identity',
  )
  public async anUnauthenticatedSealedSecretsReadAnswersLikeAnUnblockedOne(): Promise<void> {
    await this.ensureOtherIdentityKeyPair();
    const unblocked = new IdentityId(
      (await KeyPair.generate()).toPrimitives().publicKey,
    );
    const read = async (identityId: IdentityId) => {
      const response = await this.restClient.get(
        `/identity-devices/${encodeURIComponent(identityId.valueOf())}/sealed-secrets`,
        {},
      );

      return { code: response.data?.code, status: response.status };
    };

    const blockedAnswer = await read(this.otherIdentityId);

    expect(blockedAnswer.code).not.to.equal(403012);
    expect(blockedAnswer).to.deep.equal(await read(unblocked));
  }

  @given('my identity is published on this node')
  public async myIdentityIsPublishedOnThisNode(): Promise<void> {
    await this.ensureAuthenticatedIdentityIsPublished();
    this.publishedGenesisExternalIdentifier =
      await this.findCreatedIdentityExternalIdentifier();
  }

  @given('the fork is fetchable over IPFS without being held here')
  public async theForkIsFetchableOverIpfsWithoutBeingHeldHere(): Promise<void> {
    const fork = Identity.fromPrimitives(
      JSON.parse(this.body ?? '{}') as IdentityPrimitives,
    );

    await Kernel.di
      .getService<IPFS>(IPFS)
      .addJSON(
        new IpfsIdentityMapper().toDocument(fork),
        fork.getNetworkIds()[0].valueOf(),
      );
  }

  @given('I set a fork of my identity at version {int}')
  public async iSetAForkOfMyIdentityAtVersion(version: number): Promise<void> {
    await this.buildClientSignedIdentityBody(
      'Forked Identity',
      'forked-identity',
      version,
      version === 1 ? undefined : this.publishedGenesisExternalIdentifier,
    );
  }

  @given('I set my identity record under {string} of my key')
  public async iSetMyIdentityRecordUnderAnAliasOfMyKey(
    encoding: string,
  ): Promise<void> {
    await this.ensureIdentityKeyPair();
    await this.buildClientSignedIdentityBody(
      'Alias Identity',
      'alias-identity',
      1,
      undefined,
      this.aliasOf(this.ownerIdentityId as IdentityId, encoding),
    );
  }

  /** Rewrites only the header: the signature does not cover `X-Identity-Id`. */
  @given('the request names its signer by {string} of its key')
  public theRequestNamesItsSignerByAnAliasOfItsKey(encoding: string): void {
    this.headers['x-identity-id'] = this.aliasOf(
      new IdentityId(this.headers['x-identity-id']),
      encoding,
    ).valueOf();
  }

  @when('a stranger replays my public identity record')
  public async aStrangerReplaysMyPublicIdentityRecord(): Promise<void> {
    const record = await this.restClient.get('/identities/test-identity', {});
    const publication = { ...(record.data as Record<string, unknown>) };

    delete publication.identityExternalIdentifier;
    const replay = await this.restClient.post('/identities', publication, {
      headers: {},
    });

    this.replayAnswers.push({ data: replay.data, status: replay.status });
  }

  @then('both replays get the same answer')
  public bothReplaysGetTheSameAnswer(): void {
    const [unblocked, blocked] = this.replayAnswers;

    expect(JSON.stringify(blocked.data)).not.to.contain('403012');
    expect(blocked).to.deep.equal(unblocked);
  }

  @given('another identity signs the current node owner request')
  public async anotherIdentitySignsTheCurrentNodeOwnerRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = this.body ?? '{}';
    await this.signCurrentRequest(
      'PUT',
      '/node/owner',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  /** `blocked` is a comma list of `owner` and `other`, or `nobody`. */
  @given('I set a node block list body version {int} blocking {string}')
  public async iSetANodeBlockListBody(
    version: number,
    blocked: string,
  ): Promise<void> {
    await this.setNodeBlockListBody(version, blocked, 'owner', 'owner');
  }

  @given(
    'I set a node block list body version {int} blocking {string} owned by the {word} identity and signed by the {word} identity',
  )
  public async iSetANodeBlockListBodyOwnedAndSignedBy(
    version: number,
    blocked: string,
    owner: string,
    signer: string,
  ): Promise<void> {
    await this.setNodeBlockListBody(version, blocked, owner, signer);
  }

  @given(
    'I set a node block list body version {int} blocking the other identity under {string} of its key',
  )
  public async iSetANodeBlockListBodyBlockingAnAlias(
    version: number,
    encoding: string,
  ): Promise<void> {
    await this.setNodeBlockListBody(
      version,
      'other',
      'owner',
      'owner',
      encoding,
    );
  }

  @given('I set a node block list body of {int} bytes')
  public iSetANodeBlockListBodyOfBytes(bytes: number): void {
    const envelope = JSON.stringify({ type: '' });

    this.body = JSON.stringify({
      type: 'x'.repeat(bytes - envelope.length),
    });
  }

  @given('the node block list byte limit is {int}')
  public theNodeBlockListByteLimitIs(bytes: number): void {
    process.env.NODE_BLOCK_LIST_MAX_BYTES = String(bytes);
  }

  /** Stands in for a refresher fetch: the stored source got a signed list from its publisher. */
  @given(
    'the node follows a block source whose version {int} blocks the other identity',
  )
  public async theNodeFollowsABlockSource(version: number): Promise<void> {
    await this.followBlockSource(version, false);
  }

  @given(
    'the node follows an auto-applied block source whose version {int} blocks the other identity',
  )
  public async theNodeFollowsAnAutoAppliedBlockSource(
    version: number,
  ): Promise<void> {
    await this.followBlockSource(version, true);
  }

  /** Stands in for a refresher fetch of the source the node already follows. */
  @given(
    'the auto-applied block source publishes version {int} blocking the other identity under {string} of its key',
  )
  public async theBlockSourcePublishesAnAlias(
    version: number,
    encoding: string,
  ): Promise<void> {
    const publisher = await this.ensureBlockSourcePublisherKeyPair();
    const source = await Kernel.di
      .getService<NodeBlockSourceRepository>(NodeBlockSourceRepository)
      .find(new IdentityId(publisher.toPrimitives().publicKey));

    source.receive(
      await this.signedBlockSourceList(version, encoding),
      Timestamp.now(),
    );
    await this.saveBlockSource(source);
  }

  /** What a node kept from a source before ids had to be canonical: the signed list, bypassing admission. */
  @given(
    'the node stored an auto-applied block source list version {int} blocking the other identity under {string} of its key',
  )
  public async theNodeStoredAnAliasSourceList(
    version: number,
    encoding: string,
  ): Promise<void> {
    const source = await this.adoptedBlockSource(true);
    const list = NodeBlockList.fromSigned(
      await this.signedBlockSourceList(version, encoding),
    );

    await this.saveBlockSource(
      NodeBlockSource.fromPrimitives({
        ...source.toPrimitives(),
        approved: {
          identityIds: list
            .getBlockedIdentityIds()
            .map((identityId) => identityId.valueOf()),
          nodePeerIds: [],
        },
        list: list.toPrimitives(),
        versionFloor: version,
      }),
    );
  }

  @given(
    'I set a block approval body for version {int} choosing the other identity',
  )
  public async iSetABlockApprovalBodyChoosingTheOtherIdentity(
    version: number,
  ): Promise<void> {
    await this.setBlockApprovalBody(version);
  }

  @given(
    'I set a block approval body for version {int} choosing the other identity under {string} of its key',
  )
  public async iSetABlockApprovalBodyChoosingAnAlias(
    version: number,
    encoding: string,
  ): Promise<void> {
    await this.setBlockApprovalBody(version, encoding);
  }

  @given('I set a block exceptions body excepting the other identity')
  public async iSetABlockExceptionsBodyExceptingTheOtherIdentity(): Promise<void> {
    await this.setBlockExceptionsBody();
  }

  @given(
    'I set a block exceptions body excepting the other identity under {string} of its key',
  )
  public async iSetABlockExceptionsBodyExceptingAnAlias(
    encoding: string,
  ): Promise<void> {
    await this.setBlockExceptionsBody(encoding);
  }

  /** Later block source paths name the publisher by that encoding of its key. */
  @given('the block source publisher is named by {string} of its key')
  public theBlockSourcePublisherIsNamedBy(encoding: string): void {
    this.blockSourcePublisherEncoding = encoding;
  }

  /** `{publisher}` in the suffix-free path is the followed source's owner identity. */
  @given('I sign a {word} request to the block source path {string}')
  public async iSignARequestToTheBlockSourcePath(
    method: string,
    suffix: string,
  ): Promise<void> {
    await this.iSignARequestTo(method, await this.blockSourcePath(suffix));
  }

  @given(
    'another identity signs a {word} request to the block source path {string}',
  )
  public async anotherIdentitySignsARequestToTheBlockSourcePath(
    method: string,
    suffix: string,
  ): Promise<void> {
    await this.anotherIdentitySignsARequestTo(
      method,
      await this.blockSourcePath(suffix),
    );
  }

  @when('I send the {word} to the block source path {string}')
  public async iSendToTheBlockSourcePath(
    method: string,
    suffix: string,
  ): Promise<void> {
    const path = await this.blockSourcePath(suffix);
    const send: Record<string, (target: string) => Promise<void>> = {
      DELETE: (target) => this.iDELETE(target),
      GET: (target) => this.iGET(target),
      POST: (target) => this.iPOSTTo(target),
      PUT: (target) => this.iPUT(target),
    };

    await send[method](path);
  }

  @when(
    'I send the GET to the block source path {string} with the remembered {string} page cursor',
  )
  public async iSendTheGetToTheBlockSourcePathWithTheRememberedCursor(
    suffix: string,
    name: string,
  ): Promise<void> {
    const path = await this.blockSourcePath(suffix);

    await this.iGET(
      path.replace(
        'CURSOR',
        encodeURIComponent(this.pageCursors.get(name) ?? ''),
      ),
    );
  }

  @when(
    'I send the GET to the block source path {string} with the cursor for resource {string} at position {string}',
  )
  public async iSendTheGetToTheBlockSourcePathWithACursorForResource(
    suffix: string,
    resource: string,
    position: string,
  ): Promise<void> {
    const path = await this.blockSourcePath(suffix);

    await this.iGET(
      path.replace(
        'CURSOR',
        encodeURIComponent(PageCursor.encode({ position, resource })),
      ),
    );
  }

  @then('response body should contain the block source publisher id')
  public async responseBodyShouldContainTheBlockSourcePublisherId(): Promise<void> {
    const publisher = await this.ensureBlockSourcePublisherKeyPair();

    expect(JSON.stringify(this.response.data)).to.contain(
      JSON.stringify(
        new IdentityId(publisher.toPrimitives().publicKey).valueOf(),
      ).slice(1, -1),
    );
  }

  @then('the response is the stored node block list as signed canonical bytes')
  public async theResponseIsTheStoredNodeBlockListAsSignedCanonicalBytes(): Promise<void> {
    const stored = (
      await Kernel.di
        .getService<NodeBlockListRepository>(NodeBlockListRepository)
        .findLocal()
    ).toPrimitives();
    const body = this.response.data;

    if (!stored || !Buffer.isBuffer(body)) {
      throw new Error('Expected a stored list and a binary response.');
    }

    const { identitySignature, ...unsigned } = stored;

    expect(this.response.headers['content-type']).to.match(
      /^application\/json/,
    );
    expect(this.response.headers['x-identity-signature']).to.equal(
      identitySignature,
    );
    expect(body.toString('utf8')).to.equal(canonicalize(unsigned));
    expect(
      new IdentityId(unsigned.ownerIdentityId).isValidSignature(
        Buffer.concat([Buffer.from('pigeon:node-block-list:v1\n'), body]),
        new Signature(identitySignature),
      ),
    ).to.equal(true);
  }

  @given(
    'another identity signs the node blocks request with an expired timestamp',
  )
  public async anotherIdentitySignsTheNodeBlocksRequestWithAnExpiredTimestamp(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'PUT',
      '/node/blocks',
      String(Date.now() - 31_000),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the node blocks request with an expired timestamp')
  public async iSignTheNodeBlocksRequestWithAnExpiredTimestamp(): Promise<void> {
    await this.signCurrentRequest(
      'PUT',
      '/node/blocks',
      String(Date.now() - 31_000),
    );
  }

  @given('another identity signs the node blocks request claiming to be me')
  public async anotherIdentitySignsTheNodeBlocksRequestClaimingToBeMe(): Promise<void> {
    await this.signCurrentRequest(
      'PUT',
      '/node/blocks',
      String(Date.now()),
      await this.ensureOtherIdentityKeyPair(),
    );
  }

  @given('another identity signs the current node network request')
  public async anotherIdentitySignsTheCurrentNodeNetworkRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/node/networks',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('another identity signs the current node networks request')
  public async anotherIdentitySignsTheCurrentNodeNetworksRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/node/networks',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current node networks request')
  public async iSignTheCurrentNodeNetworksRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/node/networks');
  }

  @given('I sign the current node relay configuration query')
  public async iSignTheCurrentNodeRelayConfigurationQuery(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/node/relay-configuration');
  }

  @given('I sign the current node relay configuration request')
  public async iSignTheCurrentNodeRelayConfigurationRequest(): Promise<void> {
    await this.signCurrentRequest('PUT', '/node/relay-configuration');
  }

  @given('another identity signs the current node relay configuration request')
  public async anotherIdentitySignsTheCurrentNodeRelayConfigurationRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'PUT',
      '/node/relay-configuration',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current node diagnostics {string} request')
  public async iSignTheCurrentNodeDiagnosticsRequest(
    method: string,
  ): Promise<void> {
    if (method !== 'PUT') {
      this.body = undefined;
    }

    await this.signCurrentRequest(method, '/node/diagnostics');
  }

  @given('another identity signs the current node diagnostics {string} request')
  public async anotherIdentitySignsTheCurrentNodeDiagnosticsRequest(
    method: string,
  ): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      method,
      '/node/diagnostics',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I remember the current node diagnostics request')
  public iRememberTheCurrentNodeDiagnosticsRequest(): void {
    this.rememberedDiagnosticsRequest = {
      body: this.body,
      headers: { ...this.headers },
    };
  }

  @when('I replay the remembered node diagnostics PUT')
  public async iReplayTheRememberedNodeDiagnosticsPUT(): Promise<void> {
    if (!this.rememberedDiagnosticsRequest) {
      throw new Error('Node diagnostics request must be remembered first.');
    }

    // A replay accepted later than the original would open at a later instant.
    const { promise: later, resolve } = Promise.withResolvers<void>();

    setTimeout(resolve, 5);
    await later;

    this.response = await this.restClient.put(
      '/node/diagnostics',
      this.rememberedDiagnosticsRequest.body &&
        JSON.parse(this.rememberedDiagnosticsRequest.body),
      { headers: this.rememberedDiagnosticsRequest.headers },
    );
  }

  @given('I remember the opened node diagnostics session')
  public iRememberTheOpenedNodeDiagnosticsSession(): void {
    if (typeof this.response?.data?.openedAt !== 'number') {
      throw new Error('Node diagnostics session response openedAt not found.');
    }

    this.rememberedDiagnosticsOpenedAt = this.response.data.openedAt;
  }

  @then('the node diagnostics session is the remembered one')
  public theNodeDiagnosticsSessionIsTheRememberedOne(): void {
    expect(this.rememberedDiagnosticsOpenedAt).to.be.a('number');
    expect(this.response?.data?.openedAt).to.equal(
      this.rememberedDiagnosticsOpenedAt,
    );
  }

  @given('I sign the current node network request')
  public async iSignTheCurrentNodeNetworkRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/node/networks');
  }

  @given('I sign the current node public network request')
  public async iSignTheCurrentNodePublicNetworkRequest(): Promise<void> {
    this.body = JSON.stringify({ name: 'public' });
    await this.signCurrentRequest('POST', '/node/networks');
  }

  @given(
    'I sign the current node network deletion request for network {string}',
  )
  public async iSignTheCurrentNodeNetworkDeletionRequestForNetwork(
    networkId: string,
  ): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('DELETE', `/node/networks/${networkId}`);
  }

  @given(
    'another identity signs the current node network deletion request for network {string}',
  )
  public async anotherIdentitySignsTheCurrentNodeNetworkDeletionRequestForNetwork(
    networkId: string,
  ): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'DELETE',
      `/node/networks/${networkId}`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I set a conversation invitation notification body')
  public async iSetAConversationInvitationNotificationBody(): Promise<void> {
    await this.setInvitationNotificationBody(
      'one-to-one:notification-api-conversation',
      'encrypted-conversation-key',
      'conversation_invitation',
    );
  }

  @given('I set a community invitation notification body')
  public async iSetACommunityInvitationNotificationBody(): Promise<void> {
    await this.setInvitationNotificationBody(
      this.communityId || 'community-notification-api',
      undefined,
      'community_invitation',
    );
  }

  @given('I set a group conversation invitation notification body')
  public async iSetAGroupConversationInvitationNotificationBody(): Promise<void> {
    await this.setInvitationNotificationBody(
      undefined,
      'encrypted-group-conversation-key',
      'group_conversation_invitation',
    );
  }

  @given(
    'I set a group conversation invitation notification body naming a conversation',
  )
  public async iSetAGroupConversationInvitationNotificationBodyNamingAConversation(): Promise<void> {
    await this.iSetAGroupConversationInvitationNotificationBody();

    this.body = JSON.stringify({
      ...JSON.parse(this.body!),
      conversationId: 'group:notification-api-conversation',
    });
  }

  /** A group letter names no subject: its conversation id travels only in the seal. */
  private async setInvitationNotificationBody(
    subjectId: string | undefined,
    encryptedKey: string | undefined,
    type:
      | 'community_invitation'
      | 'conversation_invitation'
      | 'group_conversation_invitation',
  ): Promise<void> {
    const inviterKeyPair = await this.ensureIdentityKeyPair();
    await this.ensureOtherIdentityKeyPair();

    const inviterId = this.ownerIdentityId!.valueOf();
    const signed = signNotificationInvitation({
      encryptedKey,
      nonce: randomBytes(18).toString('base64url'),
      recipientIdentityId: this.otherIdentityId!.valueOf(),
      signer: {
        deviceCredential: inviterId,
        deviceKeyPair: inviterKeyPair,
        id: inviterId,
      },
      subjectId,
      type,
    });
    const field =
      type === 'community_invitation'
        ? { communityId: subjectId }
        : {
            ...(subjectId !== undefined && { conversationId: subjectId }),
            encryptedConversationKey: encryptedKey,
          };

    this.body = JSON.stringify({
      ...field,
      inviterIdentityId: inviterId,
      mutation: signed.body.mutation,
      nonce: signed.body.nonce,
      recipientIdentityId: this.otherIdentityId!.valueOf(),
      type,
    });
  }

  @given('I remove the mutation from the current notification body')
  public iRemoveTheMutationFromTheCurrentNotificationBody(): void {
    const body = JSON.parse(this.body || '{}');

    delete body.mutation;
    this.body = JSON.stringify(body);
  }

  @given('I sign the current notification creation request')
  public async iSignTheCurrentNotificationCreationRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/notifications');
  }

  @given('another identity signs the current notification creation request')
  public async anotherIdentitySignsTheCurrentNotificationCreationRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/notifications',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the notification recipient signs the current notifications request')
  public async notificationRecipientSignsTheCurrentNotificationsRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/notifications',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current notifications request')
  public async iSignTheCurrentNotificationsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/notifications');
  }

  @given('I sign the current notification settings request')
  public async iSignTheCurrentNotificationSettingsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/notification-settings');
  }

  @given('I sign the current notification scope settings request')
  public async iSignTheCurrentNotificationScopeSettingsRequest(): Promise<void> {
    await this.withNotificationSettingsMutation('put');
    await this.signCurrentRequest('PUT', '/notification-settings/scopes');
  }

  @given('I sign the current notification scope settings reset request')
  public async iSignTheCurrentNotificationScopeSettingsResetRequest(): Promise<void> {
    await this.withNotificationSettingsMutation('delete');
    await this.signCurrentRequest('DELETE', '/notification-settings/scopes');
  }

  @given('I sign the current push subscription request')
  public async iSignTheCurrentPushSubscriptionRequest(): Promise<void> {
    await this.signCurrentRequest('PUT', '/push/subscriptions');
  }

  @given('I sign the current push subscription removal request')
  public async iSignTheCurrentPushSubscriptionRemovalRequest(): Promise<void> {
    await this.signCurrentRequest('DELETE', '/push/subscriptions');
  }

  @given('I sign the current push test request')
  public async iSignTheCurrentPushTestRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/push/test');
  }

  @given('I set a sticker pack body')
  public iSetAStickerPackBody(): void {
    const suffix = this.stickerPackId ? 'secondary' : 'primary';

    this.body = JSON.stringify({
      name: `API stickers ${suffix}`,
    });
  }

  @given('I sign the current sticker pack creation request')
  public async iSignTheCurrentStickerPackCreationRequest(): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const packId = StickerPackId.generate().valueOf();
    const createdAt = (this.stickerClock += 1);
    const body = JSON.parse(this.body || '{}');

    await this.withStickerPackMutation(
      packId,
      (pack) => {
        pack.name = body.name;
      },
      { createdAt },
    );
    this.body = JSON.stringify({
      ...JSON.parse(this.body as string),
      savedPackMutation: await this.signStickerMutation(
        'stickerUserLibraries',
        'put',
        {
          id: `saved:${identityId}:${packId}`,
          identityId,
          packId,
          savedAt: createdAt,
          scopeType: 'sticker_saved_pack',
        },
      ),
    });
    await this.signCurrentRequest('POST', '/stickers/packs');
  }

  @given('I sign the current unsigned sticker pack creation request')
  public async iSignTheCurrentUnsignedStickerPackCreationRequest(): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();

    this.body = JSON.stringify({
      createdAt: this.stickerClock,
      name: 'Unsigned pack',
      packId: StickerPackId.generate().valueOf(),
      savedPackMutation: {},
    });
    this.body = JSON.stringify({
      ...JSON.parse(this.body),
      mutation: {
        ...(await this.signStickerMutation('stickerPacks', 'put', {
          id: 'someone-elses-pack',
          ownerIdentityId: keyPair.toPrimitives().publicKey,
        })),
      },
    });
    await this.signCurrentRequest('POST', '/stickers/packs');
  }

  @given('I remember the current sticker pack')
  public iRememberTheCurrentStickerPack(): void {
    if (!this.response?.data?.id) {
      throw new Error('Sticker pack response id not found.');
    }

    this.stickerPackId = this.response.data.id;
  }

  @given('I remember the current sticker')
  public iRememberTheCurrentSticker(): void {
    const sticker = this.response?.data?.stickers?.[0];

    if (!sticker?.id) {
      throw new Error('Sticker response id not found.');
    }

    this.stickerId = sticker.id;
  }

  @given('I remember the sticker I just created')
  public iRememberTheStickerIJustCreated(): void {
    const { stickerId } = JSON.parse(this.body || '{}') as {
      stickerId?: unknown;
    };

    if (typeof stickerId !== 'string') {
      throw new Error('Signed sticker body has no sticker id.');
    }

    this.stickerId = stickerId;
  }

  @given('I set a static sticker body')
  public iSetAStaticStickerBody(): void {
    this.body = JSON.stringify({
      assetCid: 'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq',
      contentType: 'image/png',
      dimensions: {
        height: 512,
        width: 512,
      },
      sizeBytes: 215040,
      type: 'static',
    });
  }

  @given('I set an updated sticker body')
  public iSetAnUpdatedStickerBody(): void {
    this.body = JSON.stringify({
      assetCid:
        'bafkreicupdatedstickerassetcid000000000000000000000000000000000',
      contentType: 'image/webp',
      dimensions: {
        height: 256,
        width: 256,
      },
      sizeBytes: 49152,
      type: 'static',
    });
  }

  @given('I set an oversized animated sticker body')
  public iSetAnOversizedAnimatedStickerBody(): void {
    this.body = JSON.stringify({
      assetCid: 'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq',
      contentType: 'image/webp',
      dimensions: {
        height: 512,
        width: 512,
      },
      sizeBytes: 70000,
      type: 'animated',
    });
  }

  @given('I sign the current sticker creation request')
  public async iSignTheCurrentStickerCreationRequest(): Promise<void> {
    const body = JSON.parse(this.body || '{}');
    const stickerId = StickerId.generate().valueOf();

    await this.withStickerPackMutation(this.stickerPackId as string, (pack) => {
      pack.stickers.push({ id: stickerId, ...this.stickerDetailsOf(body) });
    });
    this.body = JSON.stringify({
      ...JSON.parse(this.body as string),
      stickerId,
    });
    await this.signCurrentRequest(
      'POST',
      `/stickers/packs/${this.stickerPackId}/stickers`,
    );
  }

  @given('I sign the current sticker pack request')
  public async iSignTheCurrentStickerPackRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/stickers/packs/${this.stickerPackId}`,
    );
  }

  @given('I sign the current sticker pack update request')
  public async iSignTheCurrentStickerPackUpdateRequest(): Promise<void> {
    const body = JSON.parse(this.body || '{}');

    await this.withStickerPackMutation(this.stickerPackId as string, (pack) => {
      pack.name = body.name;
    });
    await this.signCurrentRequest(
      'PATCH',
      `/stickers/packs/${this.stickerPackId}`,
    );
  }

  @given('I sign the current sticker update request')
  public async iSignTheCurrentStickerUpdateRequest(): Promise<void> {
    const body = JSON.parse(this.body || '{}');

    await this.withStickerPackMutation(this.stickerPackId as string, (pack) => {
      const index = pack.stickers.findIndex(
        (sticker) => sticker.id === this.stickerId,
      );

      pack.stickers[index] = {
        id: this.stickerId,
        ...this.stickerDetailsOf(body),
      };
    });
    await this.signCurrentRequest(
      'PATCH',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}`,
    );
  }

  @given('I sign the current sticker removal request')
  public async iSignTheCurrentStickerRemovalRequest(): Promise<void> {
    this.body = JSON.stringify({});
    await this.withStickerPackMutation(this.stickerPackId as string, (pack) => {
      pack.stickers = pack.stickers.filter(
        (sticker) => sticker.id !== this.stickerId,
      );
    });
    await this.signCurrentRequest(
      'DELETE',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}`,
    );
  }

  @given('I sign the current sticker packs request')
  public async iSignTheCurrentStickerPacksRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/stickers/packs');
  }

  @given('I sign the current sticker library request')
  public async iSignTheCurrentStickerLibraryRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/stickers/library');
  }

  @given('I sign the current saved sticker pack request')
  public async iSignTheCurrentSavedStickerPackRequest(): Promise<void> {
    await this.withStickerLibraryMutation('saved', false);
    await this.signCurrentRequest(
      'PUT',
      `/stickers/packs/${this.stickerPackId}/saved`,
    );
  }

  @given('I sign the current saved sticker pack removal request')
  public async iSignTheCurrentSavedStickerPackRemovalRequest(): Promise<void> {
    await this.withStickerLibraryMutation('saved', true);
    await this.signCurrentRequest(
      'DELETE',
      `/stickers/packs/${this.stickerPackId}/saved`,
    );
  }

  @given('I sign the current favorite sticker request')
  public async iSignTheCurrentFavoriteStickerRequest(): Promise<void> {
    await this.withStickerLibraryMutation('favorite', false);
    await this.signCurrentRequest(
      'PUT',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/favorite`,
    );
  }

  @given('I sign the current favorite sticker removal request')
  public async iSignTheCurrentFavoriteStickerRemovalRequest(): Promise<void> {
    await this.withStickerLibraryMutation('favorite', true);
    await this.signCurrentRequest(
      'DELETE',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/favorite`,
    );
  }

  @given('I sign the current used sticker request')
  public async iSignTheCurrentUsedStickerRequest(): Promise<void> {
    await this.withStickerLibraryMutation('recent', false);
    await this.signCurrentRequest(
      'PUT',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/usage`,
    );
  }

  @when('I POST to the current sticker pack stickers')
  public async iPostToTheCurrentStickerPackStickers(): Promise<void> {
    this.response = await this.restClient.post(
      `/stickers/packs/${this.stickerPackId}/stickers`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET the current sticker pack')
  public async iGETTheCurrentStickerPack(): Promise<void> {
    this.response = await this.restClient.get(
      `/stickers/packs/${this.stickerPackId}`,
      this.headers,
    );
  }

  @when('I PATCH the current sticker pack')
  public async iPATCHTheCurrentStickerPack(): Promise<void> {
    this.response = await this.restClient.patch(
      `/stickers/packs/${this.stickerPackId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PATCH the current sticker')
  public async iPATCHTheCurrentSticker(): Promise<void> {
    this.response = await this.restClient.patch(
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current sticker')
  public async iDELETETheCurrentSticker(): Promise<void> {
    this.response = await this.restClient.delete(
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET my sticker library')
  public async iGETMyStickerLibrary(): Promise<void> {
    this.response = await this.restClient.get(
      '/stickers/library',
      this.headers,
    );
  }

  @when('I PUT the current sticker pack as saved')
  public async iPUTTheCurrentStickerPackAsSaved(): Promise<void> {
    this.response = await this.restClient.put(
      `/stickers/packs/${this.stickerPackId}/saved`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current saved sticker pack')
  public async iDELETETheCurrentSavedStickerPack(): Promise<void> {
    this.response = await this.restClient.delete(
      `/stickers/packs/${this.stickerPackId}/saved`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the current sticker as favorite')
  public async iPUTTheCurrentStickerAsFavorite(): Promise<void> {
    this.response = await this.restClient.put(
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/favorite`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current favorite sticker')
  public async iDELETETheCurrentFavoriteSticker(): Promise<void> {
    this.response = await this.restClient.delete(
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/favorite`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the current sticker usage')
  public async iPUTTheCurrentStickerUsage(): Promise<void> {
    this.response = await this.restClient.put(
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/usage`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @given(
    'the notification recipient signs the current notification patch request',
  )
  public async notificationRecipientSignsTheCurrentNotificationPatchRequest(): Promise<void> {
    if (!this.notificationId) {
      throw new Error('Notification must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();
    const recipientId = this.otherIdentityId!.valueOf();
    const body = JSON.parse(this.body || '{}');

    if (body.mutation === undefined && body.withoutMutation !== true) {
      body.mutation = signNotificationState({
        notificationId: this.notificationId,
        read: true,
        signer: {
          deviceCredential: recipientId,
          deviceKeyPair: keyPair,
          id: recipientId,
        },
        state: body.state,
      }).proof.toPrimitives();
    }

    delete body.withoutMutation;
    this.body = JSON.stringify(body);

    await this.signCurrentRequest(
      'PATCH',
      `/notifications/${this.notificationId}`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('another identity signs the current notification patch request')
  public async anotherIdentitySignsTheCurrentNotificationPatchRequest(): Promise<void> {
    if (!this.notificationId) {
      throw new Error('Notification must be created first.');
    }

    const unrelatedKeyPair = await KeyPair.generate();
    const unrelatedIdentityId = new IdentityId(
      unrelatedKeyPair.toPrimitives().publicKey,
    );

    const body = JSON.parse(this.body || '{}');

    body.mutation = signNotificationState({
      notificationId: this.notificationId,
      read: true,
      signer: {
        deviceCredential: unrelatedIdentityId.valueOf(),
        deviceKeyPair: unrelatedKeyPair,
        id: unrelatedIdentityId.valueOf(),
      },
      state: body.state,
    }).proof.toPrimitives();
    this.body = JSON.stringify(body);

    await this.signCurrentRequest(
      'PATCH',
      `/notifications/${this.notificationId}`,
      String(Date.now()),
      unrelatedKeyPair,
      unrelatedIdentityId,
    );
  }

  @given('I have created a conversation invitation notification')
  public async iHaveCreatedAConversationInvitationNotification(): Promise<void> {
    await this.iSetAConversationInvitationNotificationBody();
    await this.iSignTheCurrentNotificationCreationRequest();

    this.response = await this.restClient.post(
      '/notifications',
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not create notification: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.notificationId = this.response.data.id;
  }

  @given('I have created {int} group conversation invitation notifications')
  public async iHaveCreatedGroupConversationInvitationNotifications(
    count: number,
  ): Promise<void> {
    this.createdNotificationIds = [];

    for (let index = 0; index < count; index++) {
      await this.iSetAGroupConversationInvitationNotificationBody();
      await this.iSignTheCurrentNotificationCreationRequest();

      this.response = await this.restClient.post(
        '/notifications',
        JSON.parse(this.body || '{}'),
        { headers: this.headers },
      );

      if (this.response.status !== 200) {
        throw new Error(
          `Could not create notification: ${JSON.stringify(this.response.data)}`,
        );
      }

      this.createdNotificationIds.push(this.response.data.id);
    }
  }

  @given('the current notification is the {word} created notification')
  public theCurrentNotificationIsTheCreatedNotification(
    position: string,
  ): void {
    const ascending = this.ascendingCreatedNotificationIds();

    if (position !== 'lowest' && position !== 'highest') {
      throw new Error(`Unknown created notification position: ${position}`);
    }

    this.notificationId =
      position === 'lowest' ? ascending[0] : ascending[ascending.length - 1];
  }

  @then('response body lists the {int} lowest created notification ids')
  public responseBodyListsTheLowestCreatedNotificationIds(count: number): void {
    const results: unknown = this.response.data.results;

    if (!Array.isArray(results)) {
      throw new Error('Response body has no results array.');
    }

    const listed = results
      .map((notification: unknown) =>
        notification && typeof notification === 'object' && 'id' in notification
          ? String(notification.id)
          : '',
      )
      .sort();

    expect(listed).to.deep.equal(
      this.ascendingCreatedNotificationIds().slice(0, count),
    );
  }

  private ascendingCreatedNotificationIds(): string[] {
    return [...this.createdNotificationIds].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
  }

  @given('I set a notification accepted body')
  public iSetANotificationAcceptedBody(): void {
    this.body = JSON.stringify({
      state: 'accepted',
    });
  }

  @given('I set a notification accepted body without mutation')
  public iSetANotificationAcceptedBodyWithoutMutation(): void {
    this.body = JSON.stringify({ state: 'accepted', withoutMutation: true });
  }

  @given('I set a notification declined body')
  public iSetANotificationDeclinedBody(): void {
    this.body = JSON.stringify({
      state: 'declined',
    });
  }

  @given('I set a private node network body with id {string} and name {string}')
  public iSetAPrivateNodeNetworkBodyWithIdAndName(
    id: string,
    name: string,
  ): void {
    const { privateKey } = generateKeyPairSync('ed25519');

    this.body = JSON.stringify({
      id,
      key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      name,
    });
  }

  @given('I have created a private community text channel')
  public async iHaveCreatedAPrivateCommunityTextChannel(): Promise<void> {
    this.iSetAPrivateCommunityBody();
    await this.iSignTheCurrentCommunityCreationRequest();

    this.response = await this.restClient.post(
      '/communities',
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 201) {
      throw new Error(
        `Could not create community: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.iRememberTheCurrentCommunity();
    this.iSetACommunityTextChannelBody();
    await this.iSignTheCurrentCommunityTextChannelRequest();

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not create community channel: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.iRememberTheCurrentCommunityTextChannel();
  }

  @given('I have sent an encrypted community channel message')
  public async iHaveSentAnEncryptedCommunityChannelMessage(): Promise<void> {
    await this.iSetAnEncryptedCommunityChannelMessageBody();
    await this.iSignTheCurrentCommunityChannelMessageRequest();

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not send community channel message: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.communityChannelMessageId = this.response.data.id;
  }

  @given('I have pinned the current community channel message')
  public async iHavePinnedTheCurrentCommunityChannelMessage(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const createdAt = 1_780_000_000_000 + this.communityPinCount * 1000;
    this.communityPinCount += 1;
    const payload = {
      channelId: this.communityChannelId,
      communityId: this.communityId,
      createdAt,
      id: `community:${this.communityId}:${this.communityChannelId}:${this.communityChannelMessageId}`,
      messageId: this.communityChannelMessageId,
      pinnedByIdentityId: identityId,
      scopeType: 'community_channel',
    };
    this.body = JSON.stringify({
      createdAt,
      mutation: this.signCommunityRecord(
        payload,
        keyPair,
        undefined,
        'pins',
        await this.communityFrontier(this.communityId),
      ),
    });

    const path = `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}/pin`;

    await this.signCurrentRequest('POST', path);

    this.response = await this.restClient.post(path, JSON.parse(this.body), {
      headers: this.headers,
    });

    if (this.response.status !== 200) {
      throw new Error(
        `Could not pin community channel message: ${JSON.stringify(this.response.data)}`,
      );
    }
  }

  @given('I have saved the current community channel draft')
  public async iHaveSavedTheCurrentCommunityChannelDraft(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.communityDraftCount += 1;
    this.body = JSON.stringify({
      encryptedPayload: `encrypted-draft-payload-${this.communityDraftCount}`,
      updatedAt: 1_780_000_000_000 + this.communityDraftCount * 1000,
    });

    const path = `/communities/${this.communityId}/channels/${this.communityChannelId}/draft`;

    await this.signCurrentRequest('PUT', path);

    this.response = await this.restClient.put(path, JSON.parse(this.body), {
      headers: this.headers,
    });

    if (this.response.status !== 200) {
      throw new Error(
        `Could not save community channel draft: ${JSON.stringify(this.response.data)}`,
      );
    }
  }

  @given('I have reacted to the current community channel message')
  public async iHaveReactedToTheCurrentCommunityChannelMessage(): Promise<void> {
    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}/reactions`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not react to community channel message: ${JSON.stringify(this.response.data)}`,
      );
    }
  }

  @given('I register a test IPFS network {string}')
  public async iRegisterATestIPFSNetwork(networkName: string): Promise<void> {
    this.currentNetworkId =
      await this.ipfsDefinition.registerTestNetwork(networkName);
  }

  @given('I use an unknown IPFS network id')
  public iUseAnUnknownIPFSNetworkId(): void {
    this.currentNetworkId = randomUUID();
  }

  @given('I register a test IPFS network with id {string} and name {string}')
  public async iRegisterATestIPFSNetworkWithIdAndName(
    networkId: string,
    networkName: string,
  ): Promise<void> {
    this.currentNetworkId = await this.ipfsDefinition.registerTestNetworkWithId(
      networkId,
      networkName,
    );
  }

  @given(
    'the current node has a test network with id {string} and name {string}',
  )
  public async theCurrentNodeHasATestNetworkWithIdAndName(
    networkId: string,
    networkName: string,
  ): Promise<void> {
    const { privateKey } = generateKeyPairSync('ed25519');
    const { owner } = (
      await Kernel.di
        .getService<NodeLoaderService>(NodeLoaderService)
        .loadNode()
    ).toPrimitives();

    await Kernel.di
      .getService<NodeNetworkAdder>(NodeNetworkAdder)
      .addNetwork(
        new NodeNetworkAdderMessage(
          networkId,
          networkName,
          privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
          owner,
        ),
      );
    await Kernel.di.getService<NodeLoaderService>(NodeLoaderService).loadNode();
    await this.waitForReplicatedState();
    this.currentNetworkId = networkId;
  }

  @given('I store the following json in IPFS network {string}')
  public async iStoreTheFollowingJsonInIPFSNetwork(
    networkName: string,
    body: string,
  ): Promise<void> {
    await this.ipfsDefinition.storeJSONInNetwork(networkName, body);
  }

  @given('CID {string} has been created')
  public async cidHasBeenCreated(expectedCid: string): Promise<void> {
    await this.ipfsDefinition.assertCreatedCID(expectedCid);
  }

  @then('it has been pinned in ipfs')
  public async itHasBeenPinnedInIpfs(): Promise<void> {
    await this.ipfsDefinition.assertPinnedInIPFS(this.response.data);
  }

  @then('keychain external identifier exists in ipfs')
  public async keychainExternalIdentifierExistsInIpfs(): Promise<void> {
    await this.ipfsDefinition.assertKeychainExternalIdentifierExists(
      this.response.data,
    );
  }

  @then('nothing has been pinned in ipfs')
  public async nothingHasBeenPinnedInIpfs(): Promise<void> {
    await this.ipfsDefinition.assertNothingPinnedInIPFS(this.response.data);
  }

  @when('I POST to {string}')
  public async iPOSTTo(path: string): Promise<void> {
    this.response = await this.restClient.post(
      path,
      this.getPostBody(),
      this.getPostHeaders(),
    );

    this.rememberCreatedIdentityFromResponse();
  }

  @when('I POST the current device authorization transition')
  public async iPOSTTheCurrentDeviceAuthorizationTransition(): Promise<void> {
    const { identityId } = JSON.parse(String(this.body)) as {
      identityId: string;
    };

    await this.iPOSTTo(
      `/identity-devices/${encodeURIComponent(identityId)}/transitions`,
    );
  }

  @when(
    'I POST the current device authorization transition to another identity',
  )
  public async iPOSTTheCurrentDeviceAuthorizationTransitionToAnotherIdentity(): Promise<void> {
    const other = await this.ensureOtherIdentityKeyPair();

    await this.iPOSTTo(
      `/identity-devices/${encodeURIComponent(other.toPrimitives().publicKey)}/transitions`,
    );
  }

  @when('I POST to {string} {int} times concurrently')
  public async iPOSTToTimesConcurrently(
    path: string,
    times: number,
  ): Promise<void> {
    this.concurrentResponses = await Promise.all(
      Array.from({ length: times }, () =>
        this.restClient.post(path, this.getPostBody(), this.getPostHeaders()),
      ),
    );
  }

  @then('every concurrent response code is equal to {int}')
  public everyConcurrentResponseCodeIsEqualTo(statusCode: number): void {
    expect(
      this.concurrentResponses.map((response) => response.status),
    ).to.deep.equal(
      this.concurrentResponses.map(() => statusCode),
      JSON.stringify(this.concurrentResponses.map(({ data }) => data)),
    );
  }

  @when('I POST to the current IPFS network')
  public async iPOSTToTheCurrentIPFSNetwork(): Promise<void> {
    if (!this.currentNetworkId) {
      throw new Error('IPFS network must be registered first.');
    }

    await this.iPOSTTo(`/ipfs/${this.currentNetworkId}`);
  }

  @when('I reserve a private blob of {int} bytes')
  public async iReserveAPrivateBlob(size: number): Promise<void> {
    this.body = JSON.stringify({ size });
    await this.ensureIdentityKeyPair();
    await this.signCurrentRequest('POST', '/private-blobs');
    await this.iPOSTTo('/private-blobs');
    this.privateBlob =
      this.response.status === 201
        ? (this.response.data as unknown as typeof this.privateBlob)
        : undefined;
  }

  private privateBlobRequest(capability: string): {
    path: string;
    headers: Record<string, string>;
  } {
    const blob = this.privateBlob as unknown as Record<string, string>;

    if (!blob) {
      throw new Error('Private blob must be reserved first.');
    }

    const token =
      capability === 'none' ? undefined : blob[`${capability}Token`];

    return {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      path: `/private-blobs/${blob.blobId}`,
    };
  }

  @when('I upload {string} to the private blob with the {word} capability')
  public async iUploadToThePrivateBlob(
    text: string,
    capability: string,
  ): Promise<void> {
    const { headers, path } = this.privateBlobRequest(capability);

    this.response = await this.restClient.put(path, Buffer.from(text), headers);
  }

  @when('I download the private blob with the {word} capability')
  public async iDownloadThePrivateBlob(capability: string): Promise<void> {
    const { headers, path } = this.privateBlobRequest(capability);

    this.response = await this.restClient.getBinary(path, headers);
  }

  @when(
    'I download the private blob with the {word} capability and range {string}',
  )
  public async iDownloadThePrivateBlobRange(
    capability: string,
    range: string,
  ): Promise<void> {
    const { headers, path } = this.privateBlobRequest(capability);

    this.response = await this.restClient.getBinary(path, {
      ...headers,
      range,
    });
  }

  @when('I delete the private blob with the {word} capability')
  public async iDeleteThePrivateBlob(capability: string): Promise<void> {
    const { headers, path } = this.privateBlobRequest(capability);

    this.response = await this.restClient.delete(path, undefined, headers);
  }

  private mailbox?: {
    id: string;
    postToken: string;
    readToken: string;
    secondReadToken?: string;
  };

  private mailboxHeaders(capability: string): Record<string, string> {
    const mailbox = this.mailbox;

    if (!mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    if (capability === 'none') {
      return {};
    }

    if (capability === 'post') {
      return { authorization: `Bearer ${mailbox.postToken}` };
    }

    if (capability === 'second') {
      if (!mailbox.secondReadToken) {
        throw new Error('Second reader must be added first.');
      }

      return { authorization: `Bearer ${mailbox.secondReadToken}` };
    }

    return { authorization: `Bearer ${mailbox.readToken}` };
  }

  private mailboxHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  @when('I create a mailbox')
  public async iCreateAMailbox(): Promise<void> {
    this.mailbox = {
      id: randomBytes(32).toString('base64url'),
      postToken: randomBytes(32).toString('base64url'),
      readToken: randomBytes(32).toString('base64url'),
    };
    await this.putMailbox(this.mailbox);
  }

  private async putMailbox(mailbox: {
    id: string;
    postToken: string;
    readToken: string;
  }): Promise<void> {
    const postTokenHash = this.mailboxHash(mailbox.postToken);
    const readTokenHash = this.mailboxHash(mailbox.readToken);

    this.response = await this.restClient.put(`/mailboxes/${mailbox.id}`, {
      creationNonce: new MailboxCreationProof(
        mailbox.id,
        postTokenHash,
        readTokenHash,
      ).mine(MailboxCreationDifficulty.MIN_BITS),
      postTokenHash,
      readTokenHash,
    });
  }

  @when('I create a mailbox without proof of work')
  public async iCreateAMailboxWithoutProofOfWork(): Promise<void> {
    const id = randomBytes(32).toString('base64url');
    const postToken = randomBytes(32).toString('base64url');
    const readToken = randomBytes(32).toString('base64url');

    this.response = await this.restClient.put(`/mailboxes/${id}`, {
      postTokenHash: this.mailboxHash(postToken),
      readTokenHash: this.mailboxHash(readToken),
    });
  }

  @when('I create a mailbox with a proof of work below the required difficulty')
  public async iCreateAMailboxWithAShortProofOfWork(): Promise<void> {
    const id = randomBytes(32).toString('base64url');
    const postToken = randomBytes(32).toString('base64url');
    const readToken = randomBytes(32).toString('base64url');
    const postTokenHash = this.mailboxHash(postToken);
    const readTokenHash = this.mailboxHash(readToken);
    let nonce = 0;
    const proof = new MailboxCreationProof(id, postTokenHash, readTokenHash);

    while (proof.isValid(String(nonce), MailboxCreationDifficulty.MIN_BITS)) {
      nonce += 1;
    }

    this.response = await this.restClient.put(`/mailboxes/${id}`, {
      creationNonce: String(nonce),
      postTokenHash,
      readTokenHash,
    });
  }

  @when('I create the same mailbox again')
  public async iCreateTheSameMailboxAgain(): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    await this.putMailbox(this.mailbox);
  }

  @when('I create the mailbox again with other capabilities')
  public async iCreateTheMailboxAgainWithOtherCapabilities(): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    await this.putMailbox({
      ...this.mailbox,
      postToken: randomBytes(32).toString('base64url'),
    });
  }

  @when(
    'I append an envelope {string} of {int} bytes to the mailbox with the {word} capability',
  )
  public async iAppendAMailboxEnvelope(
    label: string,
    size: number,
    capability: string,
  ): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    this.response = await this.restClient.post(
      `/mailboxes/${this.mailbox.id}/envelopes`,
      {
        body: Buffer.alloc(size, label).toString('base64url'),
        envelopeId: createHash('sha256')
          .update(label)
          .digest('base64url')
          .slice(0, 22),
      },
      this.mailboxHeaders(capability),
    );
  }

  @when(
    'I read the mailbox envelopes after {int} limit {int} with the {word} capability',
  )
  public async iReadMailboxEnvelopes(
    after: number,
    limit: number,
    capability: string,
  ): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    this.response = await this.restClient.get(
      `/mailboxes/${this.mailbox.id}/envelopes?after=${after}&limit=${limit}`,
      this.mailboxHeaders(capability),
    );
  }

  @when('I acknowledge the mailbox up to {int} with the {word} capability')
  public async iAcknowledgeTheMailbox(
    upTo: number,
    capability: string,
  ): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    this.response = await this.restClient.post(
      `/mailboxes/${this.mailbox.id}/ack`,
      { upTo },
      this.mailboxHeaders(capability),
    );
  }

  @when('I delete the mailbox with the {word} capability')
  public async iDeleteTheMailbox(capability: string): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    this.response = await this.restClient.delete(
      `/mailboxes/${this.mailbox.id}`,
      undefined,
      this.mailboxHeaders(capability),
    );
  }

  @when('I add a second reader to the mailbox with the {word} capability')
  public async iAddASecondReaderToTheMailbox(
    capability: string,
  ): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    this.mailbox.secondReadToken ??= randomBytes(32).toString('base64url');
    this.response = await this.restClient.post(
      `/mailboxes/${this.mailbox.id}/readers`,
      { readTokenHash: this.mailboxHash(this.mailbox.secondReadToken) },
      this.mailboxHeaders(capability),
    );
  }

  @when('I list the mailbox readers with the {word} capability')
  public async iListTheMailboxReaders(capability: string): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    this.response = await this.restClient.get(
      `/mailboxes/${this.mailbox.id}/readers`,
      this.mailboxHeaders(capability),
    );
  }

  @when('I revoke the {word} reader of the mailbox with the {word} capability')
  public async iRevokeAReaderOfTheMailbox(
    reader: string,
    capability: string,
  ): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    const token =
      reader === 'second'
        ? this.mailbox.secondReadToken
        : this.mailbox.readToken;

    if (!token) {
      throw new Error('Reader must be added first.');
    }

    this.response = await this.restClient.delete(
      `/mailboxes/${this.mailbox.id}/readers/${this.mailboxHash(token)}`,
      undefined,
      this.mailboxHeaders(capability),
    );
  }

  @when('I create the mailbox again with a new read capability')
  public async iCreateTheMailboxAgainWithANewReadCapability(): Promise<void> {
    if (!this.mailbox) {
      throw new Error('Mailbox must be created first.');
    }

    await this.putMailbox({
      ...this.mailbox,
      readToken: randomBytes(32).toString('base64url'),
    });
  }

  @then('the mailbox readers should report acked cursors {string}')
  public theMailboxReadersShouldReportAckedCursors(expected: string): void {
    const data = this.response.data as unknown as {
      readers: Array<{ ackedCursor: number }>;
    };

    expect(data.readers.map((reader) => reader.ackedCursor).join(',')).to.equal(
      expected,
    );
  }

  @then('the mailbox response cursor should be {int}')
  public theMailboxResponseCursorShouldBe(cursor: number): void {
    expect((this.response.data as { cursor: number }).cursor).to.equal(cursor);
  }

  @then('the mailbox response cursor should be greater than {int}')
  public theMailboxResponseCursorShouldBeGreaterThan(cursor: number): void {
    const { cursor: actual } = this.response.data as { cursor: number };

    expect(actual).to.be.greaterThan(cursor);
  }

  @then('the mailbox page should hold cursors {string}')
  public theMailboxPageShouldHoldCursors(expected: string): void {
    const data = this.response.data as unknown as {
      envelopes: Array<{ cursor: number }>;
    };

    expect(
      data.envelopes.map((envelope) => envelope.cursor).join(','),
    ).to.equal(expected);
  }

  @then('the mailbox page should hold only cursors greater than {int}')
  public theMailboxPageShouldHoldOnlyCursorsGreaterThan(cursor: number): void {
    const data = this.response.data as unknown as {
      envelopes: Array<{ cursor: number }>;
    };
    const cursors = data.envelopes.map((envelope) => envelope.cursor);

    expect(cursors).to.not.be.empty;
    expect(Math.min(...cursors)).to.be.greaterThan(cursor);
  }

  @then('the mailbox page should report more {word}')
  public theMailboxPageShouldReportMore(expected: string): void {
    expect(
      (this.response.data as unknown as { hasMore: boolean }).hasMore,
    ).to.equal(expected === 'true');
  }

  @then('the response header {string} should be {string}')
  public theResponseHeaderShouldBe(name: string, value: string): void {
    expect(this.response.headers[name.toLowerCase()]).to.equal(value);
  }

  @when('I PUT {string}')
  public async iPUT(path: string): Promise<void> {
    this.response = await this.restClient.put(
      path,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the created identity')
  public async iPUTTheCreatedIdentity(): Promise<void> {
    if (!this.createdIdentityId) {
      throw new Error('Identity must be created first.');
    }

    this.response = await this.restClient.put(
      `/identities/${encodeURIComponent(this.createdIdentityId)}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the current identity')
  public async iPUTTheCurrentIdentity(): Promise<void> {
    this.response = await this.restClient.put(
      await this.currentIdentityPath(),
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PATCH the current notification')
  public async iPATCHTheCurrentNotification(): Promise<void> {
    if (!this.notificationId) {
      throw new Error('Notification must be created first.');
    }

    this.response = await this.restClient.patch(
      `/notifications/${this.notificationId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST a role to the current community')
  public async iPOSTARoleToTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/roles`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT roles for the current community member')
  public async iPUTRolesForTheCurrentCommunityMember(): Promise<void> {
    if (!this.communityId || !this.otherIdentityId) {
      throw new Error('Community and member must be available first.');
    }

    this.response = await this.restClient.put(
      `/communities/${this.communityId}/members/${encodeURIComponent(
        this.otherIdentityId.valueOf(),
      )}/roles`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST a ban to the current community')
  public async iPOSTABanToTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/bans`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST an invitation to the current community')
  public async iPOSTAnInvitationToTheCurrentCommunity(): Promise<void> {
    this.response = await this.restClient.post(
      `/communities/${this.communityId}/invitations`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET the current community invitations')
  public async iGETTheCurrentCommunityInvitations(): Promise<void> {
    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitations`,
      this.headers,
    );
  }

  @when('I GET the current community invitation claims')
  public async iGETTheCurrentCommunityInvitationClaims(): Promise<void> {
    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitation-claims`,
      this.headers,
    );
  }

  @when('I GET the current community invitations with query {string}')
  public async iGETTheCurrentCommunityInvitationsWithQuery(
    query: string,
  ): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitations${resolved}`,
      this.headers,
    );
  }

  @when(
    'I GET the current community invitations with a cursor for another list',
  )
  public async iGETTheCurrentCommunityInvitationsWithACursorForAnotherList(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'A'.repeat(43),
      resource: `communities/${this.communityId}/invitation-claims`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitations?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when(
    'I GET the current community invitations with a cursor whose position is not an invitation id',
  )
  public async iGETTheCurrentCommunityInvitationsWithANonInvitationIdCursor(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'not-a-digest',
      resource: `communities/${this.communityId}/invitations`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitations?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET the current community invitation claims with query {string}')
  public async iGETTheCurrentCommunityInvitationClaimsWithQuery(
    query: string,
  ): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitation-claims${resolved}`,
      this.headers,
    );
  }

  @when(
    'I GET the current community invitation claims with a cursor for another list',
  )
  public async iGETTheCurrentCommunityInvitationClaimsWithACursorForAnotherList(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'A'.repeat(43),
      resource: `communities/${this.communityId}/invitations`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitation-claims?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when(
    'I GET the current community invitation claims with a cursor whose position is not a claim id',
  )
  public async iGETTheCurrentCommunityInvitationClaimsWithANonClaimIdCursor(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'forged-claim-id-0123456789',
      resource: `communities/${this.communityId}/invitation-claims`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitation-claims?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @then('response lists {int} invitations')
  public responseListsInvitations(count: number): void {
    const { invitations } = this.response.data as { invitations: unknown[] };

    expect(invitations).to.have.lengthOf(count);
  }

  @then('response lists {int} claims')
  public responseListsClaims(count: number): void {
    const { claims } = this.response.data as { claims: unknown[] };

    expect(claims).to.have.lengthOf(count);
  }

  @then('the response next cursor is null')
  public responseNextCursorIsNull(): void {
    const { nextCursor } = this.response.data as { nextCursor: unknown };

    expect(nextCursor).to.equal(null);
  }

  @then('response next cursor is present')
  public responseNextCursorIsPresent(): void {
    const { nextCursor } = this.response.data as { nextCursor: unknown };

    expect(nextCursor).to.be.a('string');
  }

  @when('I GET the current community invitation preview with the {word} key')
  public async iGETTheCurrentCommunityInvitationPreviewWithTheKey(
    which: string,
  ): Promise<void> {
    const keys: Record<string, () => string> = {
      invitation: () => String(this.communityInvitationKey?.publicKey()),
      malformed: () => 'not a key',
      unknown: () => CommunityInvitationKey.generate().key.publicKey(),
    };

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitation-preview`,
      { Authorization: `Bearer ${keys[which]()}` },
    );
  }

  @when('I GET the current community invitation preview without a key')
  public async iGETTheCurrentCommunityInvitationPreviewWithoutAKey(): Promise<void> {
    this.response = await this.restClient.get(
      `/communities/${this.communityId}/invitation-preview`,
      {},
    );
  }

  @when(
    'the other identity POSTs the claim of the current community invitation',
  )
  public async theOtherIdentityPOSTsTheClaimOfTheCurrentCommunityInvitation(): Promise<void> {
    this.response = await this.restClient.post(
      `/communities/${this.communityId}/invitations/${encodeURIComponent(String(this.communityInvitationId))}/claims`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST the admission of the other identity to the current community')
  public async iPOSTTheAdmissionOfTheOtherIdentityToTheCurrentCommunity(): Promise<void> {
    this.response = await this.restClient.post(
      `/communities/${this.communityId}/invitations/${encodeURIComponent(String(this.communityInvitationId))}/admissions`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST the revocation of the current community invitation')
  public async iPOSTTheRevocationOfTheCurrentCommunityInvitation(): Promise<void> {
    this.response = await this.restClient.post(
      `/communities/${this.communityId}/invitations/${encodeURIComponent(String(this.communityInvitationId))}/revocation`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PATCH the current community role')
  public async iPATCHTheCurrentCommunityRole(): Promise<void> {
    if (!this.communityId || !this.communityRoleId) {
      throw new Error('Community and role must be created first.');
    }

    this.response = await this.restClient.patch(
      `/communities/${this.communityId}/roles/${this.communityRoleId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current community role')
  public async iDELETETheCurrentCommunityRole(): Promise<void> {
    if (!this.communityId || !this.communityRoleId) {
      throw new Error('Community and role must be created first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/roles/${this.communityRoleId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the ban for another identity from the current community')
  public async iDELETETheBanForAnotherIdentityFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId || !this.otherIdentityId) {
      throw new Error('Community and banned identity must be available first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/bans/${encodeURIComponent(
        this.otherIdentityId.valueOf(),
      )}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the kick for another identity from the current community')
  public async iDELETETheKickForAnotherIdentityFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId || !this.otherIdentityId) {
      throw new Error('Community and kicked identity must be available first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/members/${encodeURIComponent(
        this.otherIdentityId.valueOf(),
      )}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PATCH permissions for the current community channel')
  public async iPATCHPermissionsForTheCurrentCommunityChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.patch(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/permissions`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST to request joining the current community')
  public async iPOSTToRequestJoiningTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      '/community-membership-requests',
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE my membership from the current community')
  public async iDELETEMyMembershipFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/members/me`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @given('I sign the current communities request')
  public async iSignTheCurrentCommunitiesRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/communities');
  }

  @when('I GET current communities with query {string}')
  public async iGETCurrentCommunitiesWithQuery(query: string): Promise<void> {
    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities${resolved}`,
      this.headers,
    );
  }

  @when('I GET current communities with a cursor for another list')
  public async iGETCurrentCommunitiesWithAnotherListCursor(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: this.communityId,
      resource: 'discoverable-communities',
    });

    this.response = await this.restClient.get(
      `/communities?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET discoverable communities with query {string}')
  public async iGETDiscoverableCommunitiesWithQuery(
    query: string,
  ): Promise<void> {
    const params = query
      .replace('CURSOR', this.pageNextCursor ?? '')
      .replace(/^\?/, '');

    this.response = await this.restClient.get(
      `/discoverable-communities?query=API&networkId=${this.currentNetworkId}${params ? `&${params}` : ''}`,
      this.headers,
    );
  }

  @when('I GET discoverable communities with a cursor for another list')
  public async iGETDiscoverableCommunitiesWithAnotherListCursor(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: this.communityId,
      resource: 'communities',
    });

    this.response = await this.restClient.get(
      `/discoverable-communities?query=API&networkId=${this.currentNetworkId}&cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET community membership requests with query {string}')
  public async iGETCommunityMembershipRequestsWithQuery(
    query: string,
  ): Promise<void> {
    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/community-membership-requests${resolved}`,
      this.headers,
    );
  }

  @when('I GET community membership requests with a cursor for another list')
  public async iGETCommunityMembershipRequestsWithAnotherListCursor(): Promise<void> {
    const cursor = PageCursor.encode({
      position: '08640000000000000|foreignrequest',
      resource: 'communities',
    });

    this.response = await this.restClient.get(
      `/community-membership-requests?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET current communities')
  public async iGETCurrentCommunities(): Promise<void> {
    this.response = await this.restClient.get('/communities', this.headers);
  }

  @when('I PATCH the current community')
  public async iPATCHTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.patch(
      `/communities/${this.communityId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET discoverable communities')
  public async iGETDiscoverableCommunities(): Promise<void> {
    this.response = await this.restClient.get(
      `/discoverable-communities?query=API&networkId=${this.currentNetworkId}`,
      this.headers,
    );
  }

  @when('I GET community membership requests')
  public async iGETCommunityMembershipRequests(): Promise<void> {
    this.response = await this.restClient.get(
      '/community-membership-requests',
      this.headers,
    );
  }

  @when('I PATCH the current community membership request')
  public async iPATCHTheCurrentCommunityMembershipRequest(): Promise<void> {
    if (!this.communityMembershipRequestId) {
      throw new Error('Community membership request must be created first.');
    }

    this.response = await this.restClient.patch(
      `/community-membership-requests/${this.communityMembershipRequestId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET current calls')
  public async iGETCurrentCalls(): Promise<void> {
    this.response = await this.restClient.get('/calls', this.headers);
  }

  @when('I GET current call history')
  public async iGETCurrentCallHistory(): Promise<void> {
    this.response = await this.restClient.get('/past-calls', this.headers);
  }

  @when('I GET the current call')
  public async iGETTheCurrentCall(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.get(
      `/calls/${this.callId}`,
      this.headers,
    );
  }

  @when('I GET call ICE servers')
  public async iGETCallIceServers(): Promise<void> {
    this.response = await this.restClient.get(
      '/call-ice-servers',
      this.headers,
    );
  }

  @when('I POST a signal to the current call')
  public async iPOSTASignalToTheCurrentCall(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.post(
      `/calls/${this.callId}/signals`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST a participant join to the current call')
  public async iPOSTAParticipantJoinToTheCurrentCall(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.post(
      `/calls/${this.callId}/participants`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @given('I remember the current call join request')
  public iRememberTheCurrentCallJoinRequest(): void {
    this.rememberedCallJoinRequest = {
      body: this.body,
      headers: { ...this.headers },
    };
  }

  @when('I POST the remembered participant join to the current call')
  public async iPOSTTheRememberedParticipantJoinToTheCurrentCall(): Promise<void> {
    if (!this.callId || !this.rememberedCallJoinRequest) {
      throw new Error('Call and join request must be remembered first.');
    }

    this.response = await this.restClient.post(
      `/calls/${this.callId}/participants`,
      this.rememberedCallJoinRequest.body &&
        JSON.parse(this.rememberedCallJoinRequest.body),
      { headers: this.rememberedCallJoinRequest.headers },
    );
  }

  @when('I PATCH the participant of the current call')
  public async iPATCHTheParticipantOfTheCurrentCall(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.patch(
      `/calls/${this.callId}/participants/me`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current call')
  public async iDELETETheCurrentCall(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.delete(
      `/calls/${this.callId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current call participant')
  public async iDELETETheCurrentCallParticipant(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.delete(
      `/calls/${this.callId}/participants/me`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET the current community')
  public async iGETTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}`,
      this.headers,
    );
  }

  @when('I GET the current community frontier')
  public async iGETTheCurrentCommunityFrontier(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/frontier`,
      this.headers,
    );
  }

  @when('I GET the current community operations with query {string}')
  public async iGETTheCurrentCommunityOperationsWithQuery(
    query: string,
  ): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/operations${resolved}`,
      this.headers,
    );
  }

  @when('I GET moderation logs from the current community')
  public async iGETModerationLogsFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/moderation-logs?limit=50`,
      this.headers,
    );
  }

  @when('I GET moderation logs from the current community with query {string}')
  public async iGETModerationLogsFromTheCurrentCommunityWithQuery(
    query: string,
  ): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/moderation-logs${resolved}`,
      this.headers,
    );
  }

  @when(
    'I GET moderation logs from the current community with a cursor for another list',
  )
  public async iGETModerationLogsWithACursorForAnotherList(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'A'.repeat(24),
      resource: `communities/${this.communityId}/operations`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/moderation-logs?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET the current community operations with a cursor for another list')
  public async iGETTheCurrentCommunityOperationsWithACursorForAnotherList(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'A'.repeat(43),
      resource: `communities/${this.communityId}/moderation-logs`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/operations?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when(
    'I GET the current community operations with a cursor whose position is not a digest',
  )
  public async iGETTheCurrentCommunityOperationsWithANonDigestCursor(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'not-a-digest',
      resource: `communities/${this.communityId}/operations`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/operations?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when(
    'I GET moderation logs from the current community with a cursor whose position is not a log id',
  )
  public async iGETModerationLogsWithANonLogIdCursor(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'forged-log-id-0123456789',
      resource: `communities/${this.communityId}/moderation-logs`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/moderation-logs?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @then('response lists {int} moderation logs')
  public responseListsModerationLogs(count: number): void {
    const { logs } = this.response.data as { logs: unknown[] };

    expect(logs).to.have.lengthOf(count);
  }

  @given('I sign the current community channel pins request')
  public async iSignTheCurrentCommunityChannelPinsRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/pins`,
    );
  }

  @when('I GET pins from the current community channel with query {string}')
  public async iGETPinsFromTheCurrentCommunityChannelWithQuery(
    query: string,
  ): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/pins${resolved}`,
      this.headers,
    );
  }

  @when(
    'I GET pins from the current community channel with a cursor for another list',
  )
  public async iGETPinsFromTheCurrentCommunityChannelWithAnotherListCursor(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const cursor = PageCursor.encode({
      position: '08640000000000000|community-message:foreign',
      resource: 'community-drafts',
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/pins?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when(
    'I GET pins from the current community channel with a well-formed forged cursor',
  )
  public async iGETPinsWithAWellFormedForgedCursor(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const cursor = PageCursor.encode({
      position: '08640000000000000|forged-message',
      resource: `communities/${this.communityId}/channels/${this.communityChannelId}/pins`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/pins?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET pins from the current community channel with a garbage cursor')
  public async iGETPinsFromTheCurrentCommunityChannelWithAGarbageCursor(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/pins?cursor=not-a-cursor`,
      this.headers,
    );
  }

  @given('I sign the current community drafts request')
  public async iSignTheCurrentCommunityDraftsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/community-drafts');
  }

  @when('I GET the community drafts with query {string}')
  public async iGETTheCommunityDraftsWithQuery(query: string): Promise<void> {
    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/community-drafts${resolved}`,
      this.headers,
    );
  }

  @when('I GET the community drafts with a cursor for another list')
  public async iGETTheCommunityDraftsWithAnotherListCursor(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const cursor = PageCursor.encode({
      position: JSON.stringify([
        '08640000000000000',
        this.communityId,
        this.communityChannelId,
      ]),
      resource: `communities/${this.communityId}/channels/${this.communityChannelId}/pins`,
    });

    this.response = await this.restClient.get(
      `/community-drafts?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET the community drafts with a garbage cursor')
  public async iGETTheCommunityDraftsWithAGarbageCursor(): Promise<void> {
    this.response = await this.restClient.get(
      '/community-drafts?cursor=not-a-cursor',
      this.headers,
    );
  }

  @then('response lists {int} pins')
  public responseListsPins(count: number): void {
    const { pins } = this.response.data as { pins: unknown[] };

    expect(pins).to.have.lengthOf(count);
  }

  @then('response lists {int} drafts')
  public responseListsDrafts(count: number): void {
    const { drafts } = this.response.data as { drafts: unknown[] };

    expect(drafts).to.have.lengthOf(count);
  }

  @when('I POST a text channel to the current community')
  public async iPOSTATextChannelToTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST a voice channel to the current community')
  public async iPOSTAVoiceChannelToTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET channels from the current community')
  public async iGETChannelsFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels`,
      this.headers,
    );
  }

  @when('I GET channels from the current community with query {string}')
  public async iGETChannelsFromTheCurrentCommunityWithQuery(
    query: string,
  ): Promise<void> {
    await this.getCurrentCommunityListWithQuery('channels', query);
  }

  @when(
    'I GET channels from the current community with a cursor for another list',
  )
  public async iGETChannelsWithACursorForAnotherList(): Promise<void> {
    await this.getCurrentCommunityListWithCursor(
      'channels',
      `text|${'A'.repeat(24)}`,
      'roles',
    );
  }

  @when(
    'I GET channels from the current community with a cursor whose position is not a channel id',
  )
  public async iGETChannelsWithANonChannelIdCursor(): Promise<void> {
    await this.getCurrentCommunityListWithCursor(
      'channels',
      'text|not-a-channel',
      'channels',
    );
  }

  @given('I sign the current community members request')
  public async iSignTheCurrentCommunityMembersRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/members`,
    );
  }

  @given('I sign the current community roles request')
  public async iSignTheCurrentCommunityRolesRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/roles`,
    );
  }

  @when('I GET the current community members with query {string}')
  public async iGETTheCurrentCommunityMembersWithQuery(
    query: string,
  ): Promise<void> {
    await this.getCurrentCommunityListWithQuery('members', query);
  }

  @when('I GET the current community members with a cursor for another list')
  public async iGETTheCurrentCommunityMembersWithACursorForAnotherList(): Promise<void> {
    await this.getCurrentCommunityListWithCursor(
      'members',
      'everyone',
      'roles',
    );
  }

  @when(
    'I GET the current community members with a cursor whose position is not an identity id',
  )
  public async iGETTheCurrentCommunityMembersWithANonIdentityIdCursor(): Promise<void> {
    await this.getCurrentCommunityListWithCursor(
      'members',
      'not-an-identity',
      'members',
    );
  }

  @when('I GET the current community roles with query {string}')
  public async iGETTheCurrentCommunityRolesWithQuery(
    query: string,
  ): Promise<void> {
    await this.getCurrentCommunityListWithQuery('roles', query);
  }

  @when('I GET the current community roles with a cursor for another list')
  public async iGETTheCurrentCommunityRolesWithACursorForAnotherList(): Promise<void> {
    await this.getCurrentCommunityListWithCursor(
      'roles',
      'everyone',
      'members',
    );
  }

  @when(
    'I GET the current community roles with a cursor whose position is not a role id',
  )
  public async iGETTheCurrentCommunityRolesWithANonRoleIdCursor(): Promise<void> {
    await this.getCurrentCommunityListWithCursor(
      'roles',
      'not-a-role',
      'roles',
    );
  }

  @then('response lists {int} members')
  public responseListsMembers(count: number): void {
    const { memberIds } = this.response.data as { memberIds: unknown[] };

    expect(memberIds).to.have.lengthOf(count);
  }

  @then('response lists {int} roles')
  public responseListsRoles(count: number): void {
    const { roles } = this.response.data as { roles: unknown[] };

    expect(roles).to.have.lengthOf(count);
  }

  @then('response lists {int} requests')
  public responseListsRequests(count: number): void {
    const { requests } = this.response.data as { requests: unknown[] };

    expect(requests).to.have.lengthOf(count);
  }

  @then('response lists {int} communities')
  public responseListsCommunities(count: number): void {
    const { communities } = this.response.data as { communities: unknown[] };

    expect(communities).to.have.lengthOf(count);
  }

  @then('response lists {int} calls')
  public responseListsCalls(count: number): void {
    const { calls } = this.response.data as { calls: unknown[] };

    expect(calls).to.have.lengthOf(count);
  }

  @then('response lists {int} conversations')
  public responseListsConversations(count: number): void {
    const { conversations } = this.response.data as {
      conversations: unknown[];
    };

    expect(conversations).to.have.lengthOf(count);
  }

  @then('response lists {int} channels')
  public responseListsChannels(count: number): void {
    const { channels } = this.response.data as { channels: unknown[] };

    expect(channels).to.have.lengthOf(count);
  }

  private async getCurrentCommunityListWithQuery(
    list: 'channels' | 'members' | 'roles',
    query: string,
  ): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/${list}${resolved}`,
      this.headers,
    );
  }

  /** Requests a list with a cursor issued for `resource`, so a mismatch is a foreign or forged cursor. */
  private async getCurrentCommunityListWithCursor(
    list: 'channels' | 'members' | 'roles',
    position: string,
    resource: 'channels' | 'members' | 'roles',
  ): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const cursor = PageCursor.encode({
      position,
      resource: `communities/${this.communityId}/${resource}`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/${list}?cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I PATCH the current community text channel')
  public async iPATCHTheCurrentCommunityTextChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.patch(
      `/communities/${this.communityId}/channels/${this.communityChannelId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the current community channel')
  public async iDELETETheCurrentCommunityChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/channels/${this.communityChannelId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST a message to the current community text channel')
  public async iPOSTAMessageToTheCurrentCommunityTextChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );

    this.communityChannelMessageId = this.response?.data?.id;
  }

  @when('I GET messages from the current community text channel')
  public async iGETMessagesFromTheCurrentCommunityTextChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages?limit=50`,
      this.headers,
    );
  }

  @when(
    'I GET messages from the current community text channel with query {string}',
  )
  public async iGETMessagesFromTheCurrentCommunityTextChannelWithQuery(
    query: string,
  ): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const resolved = query.replace('CURSOR', this.pageNextCursor ?? '');

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages${resolved}`,
      this.headers,
    );
  }

  @when(
    'I GET messages from the current community text channel with a forged cursor',
  )
  public async iGETMessagesFromTheCurrentCommunityTextChannelWithAForgedCursor(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const cursor = PageCursor.encode({
      position: 'forged-message-id-that-does-not-exist',
      resource: `communities/${this.communityId}/channels/${this.communityChannelId}/messages`,
    });

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages?limit=1&cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @then('I remember the response next cursor')
  public iRememberTheResponseNextCursor(): void {
    const cursor = (this.response?.data as { nextCursor?: unknown } | undefined)
      ?.nextCursor;

    if (typeof cursor !== 'string') {
      throw new Error('Response next cursor not found.');
    }

    this.pageNextCursor = cursor;
  }

  @then('I remember the response {string} next cursor')
  public iRememberTheResponseNamedNextCursor(name: string): void {
    const cursor = (
      this.response?.data as Record<string, unknown> | undefined
    )?.[`${name}NextCursor`];

    if (typeof cursor !== 'string') {
      throw new Error(`Response ${name} next cursor not found.`);
    }

    this.pageCursors.set(name, cursor);
  }

  @then('the response {string} next cursor is null')
  public responseNamedNextCursorIsNull(name: string): void {
    const data = this.response.data as Record<string, unknown>;

    expect(data[`${name}NextCursor`]).to.equal(null);
  }

  @then('response {string} holds {int} items')
  public responseHoldsItems(name: string, count: number): void {
    const data = this.response.data as Record<string, unknown[]>;

    expect(data[name]).to.have.lengthOf(count);
  }

  @when('I GET {string} with the forged {string} cursor at position {string}')
  public async iGETWithTheForgedCursorAtPosition(
    path: string,
    resource: string,
    position: string,
  ): Promise<void> {
    this.response = await this.restClient.get(
      path.replace(
        'CURSOR',
        encodeURIComponent(PageCursor.encode({ position, resource })),
      ),
      this.headers,
    );
  }

  @then('response lists {int} sticker packs')
  public responseListsStickerPacks(count: number): void {
    const { results } = this.response.data as { results: unknown[] };

    expect(results).to.have.lengthOf(count);
  }

  @then('response lists {int} saved packs')
  public responseListsSavedPacks(count: number): void {
    const { savedPacks } = this.response.data as { savedPacks: unknown[] };

    expect(savedPacks).to.have.lengthOf(count);
  }

  @then('response lists {int} favorite stickers')
  public responseListsFavoriteStickers(count: number): void {
    const { favoriteStickers } = this.response.data as {
      favoriteStickers: unknown[];
    };

    expect(favoriteStickers).to.have.lengthOf(count);
  }

  @when('I search messages from the current community text channel')
  public async iSearchMessagesFromTheCurrentCommunityTextChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages?query=searchable&limit=20`,
      this.headers,
    );
  }

  @when('I search messages from the current community')
  public async iSearchMessagesFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/messages?query=searchable&limit=20`,
      this.headers,
    );
  }

  @when('I GET messages from the current community without a query')
  public async iGETMessagesFromTheCurrentCommunityWithoutAQuery(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/messages`,
      this.headers,
    );
  }

  @when('I DELETE the current community channel message')
  public async iDELETETheCurrentCommunityChannelMessage(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the current community channel message')
  public async iPUTTheCurrentCommunityChannelMessage(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    this.response = await this.restClient.put(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST the reaction to the current community channel message')
  public async iPOSTTheReactionToTheCurrentCommunityChannelMessage(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}/reactions`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the reaction from the current community channel message')
  public async iDELETETheReactionFromTheCurrentCommunityChannelMessage(): Promise<void> {
    if (
      !this.communityId ||
      !this.communityChannelId ||
      !this.communityChannelMessageId
    ) {
      throw new Error('Community, channel and message must be created first.');
    }

    this.response = await this.restClient.delete(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/${this.communityChannelMessageId}/reactions`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET {string}')
  public async iGET(path: string): Promise<void> {
    this.response = await this.restClient.get(path, this.headers);
  }

  @when('I GET {string} with the remembered page cursor')
  public async iGETWithTheRememberedPageCursor(path: string): Promise<void> {
    this.response = await this.restClient.get(
      path.replace('CURSOR', encodeURIComponent(this.pageNextCursor ?? '')),
      this.headers,
    );
  }

  @when('I GET {string} with a cursor for another list')
  public async iGETWithACursorForAnotherList(path: string): Promise<void> {
    await this.getWithCursor(
      path,
      PageCursor.encode({
        position: 'foreign-position',
        resource: 'discoverable-communities',
      }),
    );
  }

  @when('I GET {string} with a forged {string} cursor at position {string}')
  public async iGETWithAForgedCursorAtPosition(
    path: string,
    resource: string,
    position: string,
  ): Promise<void> {
    await this.getWithCursor(path, PageCursor.encode({ position, resource }));
  }

  @when(
    'I GET {string} with a {string} cursor whose position is {int} characters long',
  )
  public async iGETWithACursorWhosePositionIsLong(
    path: string,
    resource: string,
    length: number,
  ): Promise<void> {
    await this.getWithCursor(
      path,
      PageCursor.encode({ position: 'x'.repeat(length), resource }),
    );
  }

  @when('I GET {string} with the remembered {string} page cursor')
  public async iGETWithTheRememberedNamedPageCursor(
    path: string,
    name: string,
  ): Promise<void> {
    this.response = await this.restClient.get(
      path.replace(
        'CURSOR',
        encodeURIComponent(this.pageCursors.get(name) ?? ''),
      ),
      this.headers,
    );
  }

  @when('I GET {string} with an oversized cursor')
  public async iGETWithAnOversizedCursor(path: string): Promise<void> {
    this.response = await this.restClient.get(
      path.replace('CURSOR', 'A'.repeat(513)),
      this.headers,
    );
  }

  @when(
    'I GET {string} with a {string} cursor holding a {int} character position',
  )
  public async iGETWithACursorHoldingAPosition(
    path: string,
    resource: string,
    length: number,
  ): Promise<void> {
    this.response = await this.restClient.get(
      path.replace(
        'CURSOR',
        encodeURIComponent(
          PageCursor.encode({ position: 'x'.repeat(length), resource }),
        ),
      ),
      this.headers,
    );
  }

  @when(
    'I GET {string} with a non-canonical {string} cursor shaped as {string}',
  )
  public async iGETWithANonCanonicalCursor(
    path: string,
    resource: string,
    shape: string,
  ): Promise<void> {
    const encodeJson = (value: object): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const shapes: Record<string, string | undefined> = {
      padded: `${PageCursor.encode({ position: 'x', resource })}=`,
      'reordered keys': encodeJson({ resource, position: 'x' }),
      'extra key': encodeJson({ position: 'x', resource, extra: 'y' }),
    };
    const cursor = shapes[shape];

    if (cursor === undefined) {
      throw new Error(`Unknown non-canonical cursor shape ${shape}.`);
    }

    this.response = await this.restClient.get(
      path.replace('CURSOR', encodeURIComponent(cursor)),
      this.headers,
    );
  }

  @when(
    'I GET {string} with the cursor for resource {string} at position {string}',
  )
  public async iGETWithTheCursorForResourceAtPosition(
    path: string,
    resource: string,
    position: string,
  ): Promise<void> {
    this.response = await this.restClient.get(
      path.replace(
        'CURSOR',
        encodeURIComponent(PageCursor.encode({ position, resource })),
      ),
      this.headers,
    );
  }

  @when(
    'I GET {string} with the cursor for resource {string} at a position {int} characters long',
  )
  public async iGETWithTheCursorForResourceAtALongPosition(
    path: string,
    resource: string,
    length: number,
  ): Promise<void> {
    this.response = await this.restClient.get(
      path.replace(
        'CURSOR',
        encodeURIComponent(
          PageCursor.encode({ position: 'x'.repeat(length), resource }),
        ),
      ),
      this.headers,
    );
  }

  @when('I GET {string} with the remembered page cursor followed by {string}')
  public async iGETWithTheRememberedPageCursorFollowedBy(
    path: string,
    suffix: string,
  ): Promise<void> {
    this.response = await this.restClient.get(
      path.replace(
        'CURSOR',
        encodeURIComponent(`${this.pageNextCursor ?? ''}${suffix}`),
      ),
      this.headers,
    );
  }

  private async getWithCursor(path: string, cursor: string): Promise<void> {
    const separator = path.includes('?') ? '&' : '?';

    this.response = await this.restClient.get(
      `${path}${separator}cursor=${encodeURIComponent(cursor)}`,
      this.headers,
    );
  }

  @when('I GET {string} as binary')
  public async iGETAsBinary(path: string): Promise<void> {
    this.response = await this.restClient.getBinary(path, this.headers);
  }

  @when('I GET the published IPFS content as binary')
  public async iGETThePublishedContentAsBinary(): Promise<void> {
    this.response = await this.restClient.getBinary(
      `/ipfs/contents/${this.response.data.cid}`,
      this.headers,
    );
  }

  @when('I GET the current identity presence')
  public async iGETTheCurrentIdentityPresence(): Promise<void> {
    await this.ensureIdentityKeyPair();

    this.response = await this.restClient.get(
      `/presence/${encodeURIComponent(this.ownerIdentityId?.valueOf() || '')}`,
      this.headers,
    );
  }

  @when('I GET the current presence list')
  public async iGETTheCurrentPresenceList(): Promise<void> {
    await this.ensureIdentityKeyPair();

    this.response = await this.restClient.get(
      `/presence?identityIds=${encodeURIComponent(this.ownerIdentityId?.valueOf() || '')}`,
      this.headers,
    );
  }

  @when('I GET the authenticated identity keychain')
  public async iGetTheAuthenticatedIdentityKeychain(): Promise<void> {
    if (!this.ownerIdentityId) {
      throw new Error('Authenticated identity must exist first.');
    }

    this.response = await this.restClient.get(
      `/keychains/${encodeURIComponent(this.ownerIdentityId.valueOf())}`,
      this.headers,
    );
  }

  @when('I GET the current device list')
  public async iGetTheCurrentDeviceList(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.get(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}/devices`,
      this.headers,
    );
  }

  @when('I GET the current device authorization checkpoint')
  public async iGetTheCurrentDeviceAuthorizationCheckpoint(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.get(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}`,
      this.headers,
    );
  }

  @when('I GET the current device transition log')
  public async iGetTheCurrentDeviceTransitionLog(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.get(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}/transitions`,
      this.headers,
    );
  }

  @when('I GET the current device transition log after revision {string}')
  public async iGetTheCurrentDeviceTransitionLogAfterRevision(
    after: string,
  ): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.get(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}/transitions?after=${encodeURIComponent(after)}`,
      this.headers,
    );
  }

  @when('I GET current conversations')
  public async iGetCurrentConversations(): Promise<void> {
    this.response = await this.restClient.get(
      '/conversations?limit=20',
      this.headers,
    );
  }

  @when('I GET the created identity')
  public async iGetTheCreatedIdentity(): Promise<void> {
    if (!this.createdIdentityId) {
      throw new Error('Identity must be created first.');
    }

    this.response = await this.restClient.get(
      `/identities/${encodeURIComponent(this.createdIdentityId)}`,
      this.headers,
    );
  }

  @when('I send the signed conversation request')
  public async iSendTheSignedConversationRequest(): Promise<void> {
    if (!this.signedConversationRequest) {
      throw new Error('A conversation request must be signed first.');
    }

    const { method, path } = this.signedConversationRequest;
    const body = this.body && JSON.parse(this.body);
    const options = { headers: this.headers };
    const senders: Record<string, () => Promise<RestResponse>> = {
      DELETE: () => this.restClient.delete(path, body, options),
      GET: () => this.restClient.get(path, options.headers),
      POST: () => this.restClient.post(path, body, options),
      PUT: () => this.restClient.put(path, body, options),
    };

    this.response = await senders[method]();
  }

  @when('I DELETE {string}')
  public async iDELETE(path: string): Promise<void> {
    this.response = await this.restClient.delete(
      path,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I OPTIONS {string}')
  public async iOPTIONS(path: string): Promise<void> {
    this.response = await this.restClient.options(path, this.headers);
  }

  @then('response code is equal to {int}')
  public responseCodeIsEqualTo(statusCode: number): void {
    expect(this.response.status).to.equal(
      statusCode,
      JSON.stringify(this.response.data),
    );
  }

  @then('response body should contain {string}')
  public responseBodyShouldContain(textToContain: string): void {
    expect(JSON.stringify(this.response.data)).to.contain(
      textToContain,
      JSON.stringify(this.response.data),
    );
  }

  @then('response body should contain the current network id')
  public responseBodyShouldContainTheCurrentNetworkId(): void {
    if (!this.currentNetworkId) {
      throw new Error('Network must be registered first.');
    }

    expect(JSON.stringify(this.response.data)).to.contain(
      `"networkId":"${this.currentNetworkId}"`,
      JSON.stringify(this.response.data),
    );
  }

  @then(
    'response lists {int} community operations by digest, each signed by its author identity',
  )
  public responseListsCommunityOperationsSignedByTheirAuthors(
    count: number,
  ): void {
    const { communityId, networkId, operations } = this.response.data as {
      communityId: string;
      networkId: string;
      operations: Parameters<typeof CommunityOperation.fromPrimitives>[0][];
    };
    const verified = operations.map((primitives) =>
      CommunityOperation.fromPrimitives(primitives),
    );
    const digests = verified.map((operation) => operation.getHash());

    expect(communityId).to.equal(this.communityId);
    expect(networkId).to.equal(String(this.currentNetworkId));
    expect(operations).to.have.length(count);
    expect(digests).to.deep.equal(
      [...digests].sort((left, right) => (left < right ? -1 : 1)),
    );
    for (const operation of verified) operation.assertIdentitySigned();
    expect(verified.map((operation) => operation.toPrimitives())).to.deep.equal(
      operations,
    );
  }

  @then('binary response body should be {string}')
  public binaryResponseBodyShouldBe(expectedBody: string): void {
    expect(
      Buffer.from(this.response.data as unknown as Uint8Array).toString(),
    ).to.equal(expectedBody);
  }

  @then('response body should contain the current call')
  public responseBodyShouldContainTheCurrentCall(): void {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    expect(JSON.stringify(this.response.data)).to.contain(
      this.callId,
      JSON.stringify(this.response.data),
    );
  }

  @then('both concurrent call responses are for the same call')
  public bothConcurrentCallResponsesAreForTheSameCall(): void {
    const [firstResponse, secondResponse] = this.concurrentCallResponses;

    const statuses = [firstResponse.status, secondResponse.status].sort();

    expect(statuses).to.deep.equal([200, 201]);
    expect(secondResponse.data.id).to.equal(firstResponse.data.id);
  }

  @then('both community members can list the concurrent call')
  public async bothCommunityMembersCanListTheConcurrentCall(): Promise<void> {
    if (!this.callId || !this.ownerIdentityId || !this.otherIdentityId) {
      throw new Error('The concurrent call and both identities must exist.');
    }

    this.body = undefined;
    await this.signCurrentRequest('GET', '/calls');
    const ownerHeaders = { ...this.headers };
    const otherIdentityKeyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'GET',
      '/calls',
      String(Date.now()),
      otherIdentityKeyPair,
      this.otherIdentityId,
    );
    const otherHeaders = { ...this.headers };
    const responses = await Promise.all([
      this.restClient.get('/calls', { headers: ownerHeaders }),
      this.restClient.get('/calls', { headers: otherHeaders }),
    ]);

    for (const response of responses) {
      const calls = response.data.calls;

      expect(response.status).to.equal(200);
      expect(calls).to.be.an('array');

      const currentCall = Array.isArray(calls)
        ? calls.find(
            (call) =>
              typeof call === 'object' &&
              call !== null &&
              'id' in call &&
              call.id === this.callId,
          )
        : undefined;
      expect(currentCall).to.not.equal(undefined);
    }
  }

  @then('response body should not contain {string}')
  public responseBodyShouldnotContain(textToContain: string): void {
    expect(JSON.stringify(this.response.data)).to.not.contain(textToContain);
  }

  @then('response body should contain the current community channel id')
  public responseBodyShouldContainTheCurrentCommunityChannelId(): void {
    if (!this.communityChannelId) {
      throw new Error('Community channel must be created first.');
    }

    expect(JSON.stringify(this.response.data)).to.contain(
      this.communityChannelId,
    );
  }

  @then('response body should not contain the current community channel id')
  public responseBodyShouldNotContainTheCurrentCommunityChannelId(): void {
    if (!this.communityChannelId) {
      throw new Error('Community channel must be created first.');
    }

    expect(JSON.stringify(this.response.data)).to.not.contain(
      this.communityChannelId,
    );
  }

  @then('response body should not contain the other identity id')
  public responseBodyShouldNotContainTheOtherIdentityId(): void {
    if (!this.otherIdentityId) {
      throw new Error('Other identity must exist first.');
    }

    expect(JSON.stringify(this.response.data)).to.not.contain(
      this.otherIdentityId.valueOf(),
    );
  }

  @then('response body should not contain the current community id')
  public responseBodyShouldNotContainTheCurrentCommunityId(): void {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    expect(JSON.stringify(this.response.data)).to.not.contain(this.communityId);
  }

  @then('response body should contain the other identity id')
  public responseBodyShouldContainTheOtherIdentityId(): void {
    if (!this.otherIdentityId) {
      throw new Error('Other identity must exist first.');
    }

    expect(JSON.stringify(this.response.data)).to.contain(
      this.otherIdentityId.valueOf(),
    );
  }

  @then('response body is an array with length of {int}')
  public responseBodyIsAnArrayWithLengthOf(arrayLength: number): void {
    expect(this.response.data.results ?? this.response.data).to.have.lengthOf(
      arrayLength,
    );
  }

  @then('response body should be empty')
  public responseBodyShouldBeEmpty(): void {
    expect(this.response.data).to.equal('');
  }

  @then('response contains a pending call signal delivery')
  public responseContainsPendingCallSignalDelivery(): void {
    expect(this.response.data.signalId).to.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(this.response.data.expiresAt).to.be.greaterThan(Date.now());
  }

  @then('response contains a valid resource with the following fields')
  public responseContainsValidResource(table: DataTable): void {
    const rows = table.rows();
    for (const row of rows) {
      const fieldPath = row[0];
      const expectedValue = row[1];

      const pathParts = fieldPath.split('.');
      let actualValue: unknown = this.response.data;

      for (const part of pathParts) {
        actualValue = this.resolveResponsePath(actualValue, part);
      }

      // Convert to string for comparison to handle type differences
      const actualValueStr = String(actualValue);

      expect(actualValueStr).to.equal(
        expectedValue,
        `Field ${fieldPath} does not match expected value`,
      );
    }
  }

  @then(
    'response body array {int} should contain property {string} with value {string}',
  )
  public responseBodyArrayShouldContainPropertyWithValue(
    index: number,
    property: string,
    value: string,
  ): void {
    expect(this.response.data.results[index])
      .to.have.property(property)
      .that.equals(value);
  }

  @then('response data should match partially')
  public responseDataShouldMatchPartially(expectedData: string): void {
    expect(this.response.data).to.containSubset(JSON.parse(expectedData));
  }

  @then('response data should match exactly')
  public responseDataShouldMatchExactly(expectedData: string): void {
    expect(this.response.data).to.deep.equal(JSON.parse(expectedData));
  }

  @then('response header {string} should be {string}')
  public responseHeaderShouldBe(
    headerName: string,
    expectedValue: string,
  ): void {
    const actualValue = this.response.headers[headerName.toLowerCase()];
    expect(actualValue).to.equal(
      expectedValue,
      `Header ${headerName} does not match expected value. Expected: ${expectedValue}, Actual: ${actualValue}`,
    );
  }

  @then('response header {string} should contain {string}')
  public responseHeaderShouldContain(
    headerName: string,
    expectedValue: string,
  ): void {
    const actualValue = this.response.headers[headerName.toLowerCase()];
    expect(actualValue).to.contain(
      expectedValue,
      `Header ${headerName} does not contain expected value. Expected to contain: ${expectedValue}, Actual: ${actualValue}`,
    );
  }

  @then('response does not contain property {string}')
  public responseDoesNotContainProperty(property: string): void {
    expect(this.response.data).to.not.have.property(property);
  }
}
