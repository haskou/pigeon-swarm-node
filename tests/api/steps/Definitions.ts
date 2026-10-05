import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import { PrivateAuthorizationRequestBodyLimit } from '@app/apps/apis/private-authorization-api/routes/PrivateAuthorizationRequestBodyLimit';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import PigeonApplication from '@app/apps/PigeonApplication';
import OrbitDBCallProjectionRuntime from '@app/apps/runtimes/orbitdb-call-projection-runtime/OrbitDBCallProjectionRuntime';
import OrbitDBReplicatedStateRuntime from '@app/apps/runtimes/orbitdb-runtime/OrbitDBReplicatedStateRuntime';
import CallParticipantLeaseExpirationRegistrar from '@app/contexts/calls/application/expire-participant-leases/CallParticipantLeaseExpirationRegistrar';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityInviteToken } from '@app/contexts/communities/domain/value-objects/CommunityInviteToken';
import { CommunityModerationLogId } from '@app/contexts/communities/domain/value-objects/CommunityModerationLogId';
import { CommunityRequestId } from '@app/contexts/communities/domain/value-objects/CommunityRequestId';
import { CommunityRoleId } from '@app/contexts/communities/domain/value-objects/CommunityRoleId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { DeviceAuthorizationRepository } from '@app/contexts/identity-devices/domain/repositories/DeviceAuthorizationRepository';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import { NodeNetworkAdderMessage } from '@app/contexts/nodes/application/add-network/messages/NodeNetworkAdderMessage';
import NodeNetworkAdder from '@app/contexts/nodes/application/add-network/NodeNetworkAdder';
import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import Ed25519PrivateDeviceCredentialCodec from '@app/contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { DataTable, setDefaultTimeout } from '@cucumber/cucumber';
import { Kernel } from '@haskou/ddd-kernel';
import {
  KeyPair,
  PrivateGenesisSignature,
  PrivateKey,
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

import { signCommunityOperation } from '../../support/signCommunityOperation';
import IPFSDefinition from './IPFSDefinition';
import RestClient from './RestClient';
import { RestResponse } from './RestResponse';

chai.use(chaiSubset);

setDefaultTimeout(20_000);

let application: PigeonApplication | null = null;

type StickerPackDocument = Record<string, unknown> & {
  stickers: Record<string, unknown>[];
};

@binding()
export default class Definitions {
  private binaryBody: Buffer | undefined;
  private readonly notificationSettingsSequences = new Map<string, number>();
  private readonly communityRecordSequences = new Map<string, number>();
  private communityChannelType: 'text' | 'voice' = 'text';
  private communityMembershipRequest: Record<string, unknown> | undefined;
  private readonly stickerMutationSequences = new Map<string, number>();
  private readonly stickerPackDocuments = new Map<
    string,
    StickerPackDocument
  >();

  private stickerClock = 1_780_000_000_000;
  private body: string | undefined;
  private callId: string | undefined;
  private communityChannelId: string | undefined;
  private communityChannelMessageId: string | undefined;
  private communityThreadRootMessageId: string | undefined;
  private communityMessageCreatedAt = 0;
  private communityId: string | undefined;
  private communityInviteToken: string | undefined;
  private communityMembershipRequestId: string | undefined;
  private communityRoleId: string | undefined;
  private concurrentCallResponses: RestResponse[] = [];
  private formData: FormData | undefined;
  private headers: Record<string, string> = {};
  private identityKeyPair: KeyPair | undefined;
  private identityDeviceOwnerKeyPair: KeyPair | undefined;
  private identityRecoveryKeyPair: KeyPair | undefined;
  private identityDeviceTargetKeyPair: KeyPair | undefined;

  private conversationId: string | undefined;
  private currentNetworkId: string | undefined;
  private createdIdentityId: string | undefined;
  private keychainExternalIdentifier: string | undefined;
  private messageId: string | undefined;
  private notificationId: string | undefined;
  private privateAuthorizationScopeId: string | undefined;
  private otherIdentityId: IdentityId | undefined;
  private otherIdentityKeyPair: KeyPair | undefined;

  private ownerIdentityId: IdentityId | undefined;
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
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const recoveryKeyPair = await this.ensureIdentityRecoveryKeyPair();
    const ownerIdentityId = this.ownerIdentityId as IdentityId;
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
      authorizationRevision: 0,
      deviceCredential: deviceCredential.valueOf(),
      deviceCredentialCommitment: deviceCredential.getCommitment().valueOf(),
      id: ownerIdentityId.valueOf(),
      networks,
      previousIdentityExternalIdentifier,
      profile,
      recoveryAuthority: recoveryKeyPair.toPrimitives().publicKey,
      timestamp: 1773848829055 + version,
      version,
    };
    const signature = keyPair.sign(JSON.stringify(signaturePayload)).valueOf();

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
      await this.signCurrentRequest('POST', '/identities/');

      const response = await this.restClient.post(
        '/identities/',
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

  private getCurrentRequestBody(): unknown {
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
  ): Record<string, unknown> {
    const recordId = String(payload.id);
    const next = sequence ?? this.communityRecordSequences.get(recordId) ?? 0;
    const identityId = keyPair.toPrimitives().publicKey;
    const proofBody = {
      author: { deviceCredential: identityId, identityId },
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
      version: 1,
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
    type: 'invitation' | 'request',
    creatorIdentityId: string,
    identityId: string,
    createdAt: number,
  ): Record<string, unknown> {
    const communityId = String(this.communityId);

    return {
      communityId,
      createdAt,
      creatorIdentityId,
      id: CommunityRequestId.derive(
        communityId,
        type,
        creatorIdentityId,
        identityId,
        createdAt,
      ).valueOf(),
      identityId,
      scopeType: 'community_membership_request',
      status: 'pending',
      type,
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
      `/communities/membership-requests/${this.communityMembershipRequestId}`,
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
        /^\/communities\/[^/]+\/channels\/(text|voice)$/,
        (match) => ({
          action: 'channel_created',
          details: { name: body.name, type: match[1] },
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
        'POST',
        /^\/communities\/[^/]+\/invites$/,
        () => ({
          action: 'invite_link_created',
          details: {
            encryptedCommunityKeyStored: Boolean(body.encryptedCommunityKey),
            expiresAt: body.expiresAt,
            maxUses: body.maxUses,
          },
          target: {
            id: CommunityInviteToken.derive(
              communityId,
              actorIdentityId,
              text.nonce,
            ).valueOf(),
            type: 'invite',
          },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/members$/,
        () => ({
          action: 'invitation_created',
          details: { identityId: body.identityId },
          target: {
            id: CommunityRequestId.derive(
              communityId,
              'invitation',
              actorIdentityId,
              text.identityId,
              Number(body.createdAt),
            ).valueOf(),
            type: 'membership_request',
          },
        }),
      ],
      [
        'PATCH',
        /^\/communities\/membership-requests\/[^/]+$/,
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
        /^\/communities\/[^/]+\/channels\/(text|voice)$/,
        (match) => ({
          action: 'channel_created',
          args: {
            channelId: CommunityChannelId.derive(
              communityId,
              actorIdentityId,
              createdAt,
            ).valueOf(),
            name: body.name,
            type: match[1],
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
        /^\/communities\/[^/]+\/members\/([^/]+)\/kick$/,
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
        /^\/communities\/invites\/([^/]+)\/accept$/,
        (match) => ({
          action: 'member_joined',
          args: {
            identityId: actorIdentityId,
            method: 'invite_link',
            reference: decoded(match),
          },
        }),
      ],
      [
        'POST',
        /^\/communities\/[^/]+\/join-requests$/,
        () => ({
          action: 'member_joined',
          args: { identityId: actorIdentityId, method: 'automatic' },
        }),
      ],
      [
        'PATCH',
        /^\/communities\/membership-requests\/[^/]+$/,
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
                  method:
                    request.type === 'request' ? 'approval' : 'invitation',
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

    if (method === 'POST' && pathname === '/communities/') {
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
      },
    });

    this.body = JSON.stringify({ ...body, operation: signed.body });
  }

  private async signCurrentRequest(
    method: string,
    path: string,
    timestamp: string = String(Date.now()),
    keyPair: KeyPair | undefined = undefined,
    identityId: IdentityId | undefined = undefined,
  ): Promise<void> {
    const signerKeyPair = await this.resolveSignerKeyPair(keyPair);
    const signerIdentityId = this.resolveSignerIdentityId(identityId);
    const createdAt = Date.now();

    await this.attachCommunityOperation(method, path, signerKeyPair, createdAt);
    this.attachCommunityModerationLog(method, path, signerKeyPair, createdAt);
    const verifier = new SignedHttpRequestVerifier();
    const signedRequestPayload = verifier.getCanonicalPayload(
      method,
      path,
      timestamp,
      this.getCurrentRequestBody(),
    );

    this.headers['x-identity-id'] = signerIdentityId?.valueOf() || '';
    this.headers['x-timestamp'] = timestamp;
    this.headers['x-signature'] = signerKeyPair
      .sign(JSON.stringify(signedRequestPayload))
      .valueOf();
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
    this.communityChannelId = undefined;
    this.communityChannelMessageId = undefined;
    this.communityThreadRootMessageId = undefined;
    this.communityId = undefined;
    this.communityInviteToken = undefined;
    this.communityMembershipRequestId = undefined;
    this.communityMembershipRequest = undefined;
    this.communityRecordSequences.clear();
    this.communityRoleId = undefined;
    this.concurrentCallResponses = [];
    this.formData = undefined;
    this.headers = {};
    this.identityKeyPair = undefined;
    this.identityDeviceOwnerKeyPair = undefined;
    this.conversationId = undefined;
    this.currentNetworkId = undefined;
    this.createdIdentityId = undefined;
    this.keychainExternalIdentifier = undefined;
    this.messageId = undefined;
    this.notificationId = undefined;
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
    if (!application) {
      application = new PigeonApplication();
      application.loadEnvironmentVariables('test');
      this.ipfsDefinition.cleanupStorageFolder(process.env.IPFS_STORAGE_PATH);

      await application.dependencyInjection();
      await application.runServer();
      application.logs();
      await application.runRuntimes(
        OrbitDBReplicatedStateRuntime,
        OrbitDBCallProjectionRuntime,
      );
    }
  }

  @after()
  public async cleanupScenarioStorage(): Promise<void> {
    const database = Kernel.di.getService<EmbeddedLocalDatabase>(
      EmbeddedLocalDatabase,
    );
    const callRelayRecordRegistry =
      Kernel.di.getService<CallRelayRecordRegistry>(CallRelayRecordRegistry);

    await database.clear();
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
    await this.ipfsDefinition.cleanupRegisteredNetworks();
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

  @given('I set header {string} to {string}')
  public iSetHeaderTo(header: string, value: string): void {
    this.headers[header] = value;
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
      .sign(JSON.stringify(keychainSignaturePayload))
      .valueOf();
    const signedBody = {
      ...parsedBody,
      signature,
    };

    this.body = JSON.stringify(signedBody);
    await this.signCurrentRequest('POST', '/keychains/');
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

    expect(await repository.findScope(scopeId)).not.to.equal(undefined);
    expect(await repository.findProjection(scopeId)).to.containSubset({
      id: scopeId,
    });
    expect(await repository.findProtectedMlsState(scopeId)).to.equal(
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
  }

  @given('I sign the current device authorization checkpoint request')
  public async iSignTheCurrentDeviceAuthorizationCheckpointRequest(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.body = undefined;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}`;
    await this.signCurrentRequest('GET', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
      'GET',
      path,
      timestamp,
      this.getCurrentRequestBody(),
    );
    const device = await this.ensureIdentityDeviceOwnerKeyPair();
    this.headers['x-device-credential'] = new IdentityId(
      device.toPrimitives().publicKey,
    ).valueOf();
    this.headers['x-device-signature'] = device
      .sign(JSON.stringify(payload))
      .valueOf();
  }

  @given('I sign the current device authorization checkpoint recovery request')
  public async iSignTheCurrentDeviceAuthorizationCheckpointRecoveryRequest(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.body = undefined;
    const path = `/identity-devices/${encodeURIComponent(identityId.valueOf())}`;
    await this.signCurrentRequest('GET', path);
    const timestamp = this.headers['x-timestamp'] as string;
    const payload = new SignedHttpRequestVerifier().getCanonicalPayload(
      'GET',
      path,
      timestamp,
      this.getCurrentRequestBody(),
    );
    const recoveryAuthority = await this.ensureIdentityRecoveryKeyPair();
    this.headers['x-recovery-signature'] = recoveryAuthority
      .sign(JSON.stringify(payload))
      .valueOf();
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
      .find(identityId);

    expect(authorization?.getRevision().valueOf()).to.equal(0);
  }

  @then('response is the current device authorization checkpoint')
  public responseIsTheCurrentDeviceAuthorizationCheckpoint(): void {
    expect(this.response?.data).to.deep.equal({
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

  @given('I sign the current presence update request')
  public async iSignTheCurrentPresenceUpdateRequest(): Promise<void> {
    await this.signCurrentRequest('PUT', '/presence/me');
  }

  @given('I sign the current link preview request')
  public async iSignTheCurrentLinkPreviewRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/link-previews');
  }

  @given('I sign the current presence custom message deletion request')
  public async iSignTheCurrentPresenceCustomMessageDeletionRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('DELETE', '/presence/me/custom-message');
  }

  @given('I sign the current presence list request')
  public async iSignTheCurrentPresenceListRequest(): Promise<void> {
    this.body = undefined;
    await this.ensureIdentityKeyPair();
    await this.signCurrentRequest('GET', '/presence/');
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
      '/keychains/',
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
    await this.signCurrentRequest('POST', '/communities/');
  }

  @given('I remember the current community')
  public iRememberTheCurrentCommunity(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community response id not found.');
    }

    this.communityId = this.response.data.id;
  }

  @given('I set a community member body for another identity')
  public async iSetACommunityMemberBodyForAnotherIdentity(): Promise<void> {
    await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      identityId: this.otherIdentityId?.valueOf(),
    });
  }

  @given('I set a community invite body')
  public iSetACommunityInviteBody(): void {
    this.body = JSON.stringify({
      maxUses: 1,
    });
  }

  @given('I set a community invite body with an encrypted community key')
  public iSetACommunityInviteBodyWithAnEncryptedCommunityKey(): void {
    this.body = JSON.stringify({
      encryptedCommunityKey: {
        algorithm: 'AES-GCM',
        ciphertext: 'encryptedcommunitykeyciphertext',
        nonce: 'encryptedcommunitykeynonce',
        version: 1,
      },
      maxUses: 1,
    });
  }

  @given('I set an expired community invite body')
  public iSetAnExpiredCommunityInviteBody(): void {
    this.body = JSON.stringify({
      expiresAt: Date.now() - 1_000,
      maxUses: 1,
    });
  }

  @given('I sign the current community member request')
  public async iSignTheCurrentCommunityMemberRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureIdentityKeyPair();
    const body = JSON.parse(this.body ?? '{}');
    const createdAt = Date.now();
    const payload = this.communityRequestPayload(
      'invitation',
      String(this.ownerIdentityId?.valueOf()),
      body.identityId,
      createdAt,
    );

    this.body = JSON.stringify({
      ...body,
      createdAt,
      mutation: this.signCommunityRecord(payload, keyPair),
    });
    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/members`,
    );
  }

  @given('I sign the current community invite request')
  public async iSignTheCurrentCommunityInviteRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureIdentityKeyPair();
    const creatorIdentityId = String(this.ownerIdentityId?.valueOf());
    const body = JSON.parse(this.body ?? '{}');
    const nonce = randomUUID().replace(/-/g, '');
    const createdAt = Date.now();
    const token = CommunityInviteToken.derive(
      this.communityId,
      creatorIdentityId,
      nonce,
    ).valueOf();
    const payload = {
      communityId: this.communityId,
      createdAt,
      creatorIdentityId,
      ...(body.encryptedCommunityKey && {
        encryptedCommunityKey: body.encryptedCommunityKey,
      }),
      ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt }),
      id: token,
      maxUses: body.maxUses,
      nonce,
      scopeType: 'community_invite',
      token,
    };

    this.body = JSON.stringify({
      ...body,
      createdAt,
      mutation: this.signCommunityRecord(payload, keyPair),
      nonce,
    });
    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/invites`,
    );
  }

  @given('I remember the current community invite')
  public iRememberTheCurrentCommunityInvite(): void {
    if (!this.response?.data?.inviteToken) {
      throw new Error('Community invite token not found.');
    }

    this.communityInviteToken = this.response.data.inviteToken;
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
      '/communities/',
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
      '/communities/membership-requests',
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
      '/communities/discover',
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

  @given(
    'the community member signs the current community invite accept request',
  )
  public async theCommunityMemberSignsTheCurrentCommunityInviteAcceptRequest(): Promise<void> {
    if (!this.communityInviteToken || !this.communityId) {
      throw new Error('Community invite must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();
    const identityId = String(this.otherIdentityId?.valueOf());
    const usedAt = Date.now();
    const payload = {
      communityId: this.communityId,
      id: `invite-use:${this.communityInviteToken}:${identityId}`,
      identityId,
      scopeType: 'community_invite_use',
      token: this.communityInviteToken,
      usedAt,
    };

    this.body = JSON.stringify({
      mutation: this.signCommunityRecord(payload, keyPair),
      usedAt,
    });
    await this.signCurrentRequest(
      'POST',
      `/communities/invites/${this.communityInviteToken}/accept`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('the community member signs the current community join request')
  public async theCommunityMemberSignsTheCurrentCommunityJoinRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();
    const identityId = String(this.otherIdentityId?.valueOf());
    const createdAt = Date.now();
    const payload = this.communityRequestPayload(
      'request',
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
      createdAt,
      mutation: this.signCommunityRecord(payload, keyPair),
    });
    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/join-requests`,
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
    await this.signCurrentRequest('GET', '/communities/membership-requests');
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

  @given('I set a community text channel body')
  public iSetACommunityTextChannelBody(): void {
    this.body = JSON.stringify({
      name: 'general',
    });
  }

  @given('I set a community voice channel body')
  public iSetACommunityVoiceChannelBody(): void {
    this.body = JSON.stringify({
      name: 'voice',
    });
  }

  @given('I sign the current community text channel request')
  public async iSignTheCurrentCommunityTextChannelRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels/text`,
    );
  }

  @given('I sign the current community voice channel request')
  public async iSignTheCurrentCommunityVoiceChannelRequest(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/communities/${this.communityId}/channels/voice`,
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
      `/communities/${this.communityId}/channels/text`,
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

  @given('I sign the current community channel message search request')
  public async iSignTheCurrentCommunityChannelMessageSearchRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/search`,
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
      `/communities/${this.communityId}/messages/search`,
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
      author: { deviceCredential: identityId, identityId },
      kind,
      operationId: `api-reaction-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId,
      sequence,
      store: 'reactions',
      version: 1,
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
    await this.signCurrentRequest('POST', '/conversations/');
  }

  @given('I have created a one-to-one conversation')
  public async iHaveCreatedAOneToOneConversation(): Promise<void> {
    await this.iHavePublishedAKeychainForTheAuthenticatedIdentity();
    await this.iSetAOneToOneConversationBodyForANewParticipant();
    await this.iSignTheCurrentOneToOneConversationRequest();

    this.response = await this.restClient.post(
      '/conversations/',
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

  @given('I have created a group conversation')
  public async iHaveCreatedAGroupConversation(): Promise<void> {
    await this.createGroupConversation(3);
  }

  @given('I have created a two-member group conversation')
  public async iHaveCreatedATwoMemberGroupConversation(): Promise<void> {
    await this.createGroupConversation(2);
  }

  private async createGroupConversation(
    participantCount: number,
  ): Promise<void> {
    await this.iHavePublishedAKeychainForTheAuthenticatedIdentity();
    await this.iSetAGroupConversationBodyForNewParticipants();
    const body = JSON.parse(this.body || '{}');
    body.participantIds = body.participantIds.slice(0, participantCount);
    this.body = JSON.stringify(body);
    await this.iSignTheCurrentOneToOneConversationRequest();

    this.response = await this.restClient.post(
      '/conversations/',
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not create group conversation: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.conversationId = this.response.data.id;
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
    await this.signCurrentRequest('POST', '/calls/');
  }

  @given('the community member signs the current call start request')
  public async theCommunityMemberSignsTheCurrentCallStartRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/calls/',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @when('both community members start the current call concurrently')
  public async bothCommunityMembersStartTheCurrentCallConcurrently(): Promise<void> {
    const body = JSON.parse(this.body || '{}');

    await this.signCurrentRequest('POST', '/calls/');
    const ownerHeaders = { ...this.headers };
    const otherIdentityKeyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/calls/',
      String(Date.now()),
      otherIdentityKeyPair,
      this.otherIdentityId,
    );
    const otherHeaders = { ...this.headers };

    this.concurrentCallResponses = await Promise.all([
      this.restClient.post('/calls/', body, { headers: ownerHeaders }),
      this.restClient.post('/calls/', body, { headers: otherHeaders }),
    ]);
    this.response = this.concurrentCallResponses[0];
    this.callId = String(this.concurrentCallResponses[0].data.id);
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
    await this.signCurrentRequest('GET', '/calls/');
  }

  @given('I sign the current call history request')
  public async iSignTheCurrentCallHistoryRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/calls/history');
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
    await this.signCurrentRequest('GET', '/calls/ice-servers');
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
      'POST',
      `/calls/${this.callId}/participants/me/heartbeat`,
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
      'POST',
      `/calls/${this.callId}/participants/me/heartbeat`,
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

  @given('I set an encrypted conversation message body')
  public async iSetAnEncryptedConversationMessageBody(): Promise<void> {
    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();

    this.body = JSON.stringify({
      createdAt,
      encryptedPayload: 'encrypted-message-payload',
      id,
      mutation: await this.conversationMessageMutation({
        conversationId: this.conversationId || '',
        createdAt,
        encryptedPayload: 'encrypted-message-payload',
        id,
        previousMessageIds: [],
        type: MessageType.SENT.valueOf(),
      }),
      previousMessageIds: [],
    });
  }

  @given('I set an encrypted conversation reply body')
  public async iSetAnEncryptedConversationReplyBody(): Promise<void> {
    if (!this.messageId) {
      throw new Error('Message must be created first.');
    }

    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();

    this.body = JSON.stringify({
      createdAt,
      encryptedPayload: 'encrypted-reply-payload',
      id,
      mutation: await this.conversationMessageMutation({
        conversationId: this.conversationId || '',
        createdAt,
        encryptedPayload: 'encrypted-reply-payload',
        id,
        previousMessageIds: [this.messageId],
        replyToMessageId: this.messageId,
        type: MessageType.SENT.valueOf(),
      }),
      previousMessageIds: [this.messageId],
      replyToMessageId: this.messageId,
    });
  }

  @given('I set a delete conversation message body')
  public async iSetADeleteConversationMessageBody(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();

    this.body = JSON.stringify({
      createdAt,
      id,
      mutation: await this.conversationMessageMutation({
        conversationId: this.conversationId,
        createdAt,
        id,
        previousMessageIds: [this.messageId],
        targetMessageId: this.messageId,
        type: MessageType.DELETED.valueOf(),
      }),
    });
  }

  @given('I set an edit conversation message body')
  public async iSetAnEditConversationMessageBody(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();
    const previousMessageIds = [this.messageId];

    this.body = JSON.stringify({
      createdAt,
      encryptedPayload: 'edited-message-payload',
      id,
      mutation: await this.conversationMessageMutation({
        conversationId: this.conversationId,
        createdAt,
        encryptedPayload: 'edited-message-payload',
        id,
        previousMessageIds,
        targetMessageId: this.messageId,
        type: MessageType.EDITED.valueOf(),
      }),
      previousMessageIds,
    });
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
      author: { deviceCredential: identityId, identityId },
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
      version: 1,
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
      author: { deviceCredential: identityId, identityId },
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
      version: 1,
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
      author: { deviceCredential: identityId, identityId },
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
      version: 1,
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
      author: { deviceCredential: identityId, identityId },
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
      version: 1,
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

  private async conversationReactionMutationBody(
    kind: 'put' | 'delete',
  ): Promise<string> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    const keyPair = await this.ensureIdentityKeyPair();
    const identityId = keyPair.toPrimitives().publicKey;
    const emoji = '👍';
    const createdAt = 1_780_000_000_000;
    const recordId = [
      'conversation',
      this.conversationId,
      this.messageId,
      identityId,
      emoji,
    ].join(':');
    const document = {
      authorId: identityId,
      conversationId: this.conversationId,
      emoji,
      id: recordId,
      messageId: this.messageId,
      scopeType: 'conversation',
    };
    const payload =
      kind === 'put'
        ? { ...document, createdAt }
        : { ...document, removed: true };
    const sequence = kind === 'put' ? 0 : 1;
    const proofBody = {
      author: { deviceCredential: identityId, identityId },
      kind,
      operationId: `api-conversation-reaction-${sequence}`.padEnd(22, '0'),
      payloadDigest: PublicMutationProof.digestOf(payload),
      predecessor:
        sequence === 0 ? null : PublicMutationProof.digestOf({ previous: 0 }),
      recordId,
      sequence,
      store: 'reactions',
      version: 1,
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

  @given('I set a conversation message reaction body')
  public async iSetAConversationMessageReactionBody(): Promise<void> {
    this.body = await this.conversationReactionMutationBody('put');
  }

  @given('I sign the current conversation message request')
  public async iSignTheCurrentConversationMessageRequest(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/conversations/${this.conversationId}/messages`,
    );
  }

  @given('I sign the current conversation message deletion request')
  public async iSignTheCurrentConversationMessageDeletionRequest(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    await this.signCurrentRequest(
      'DELETE',
      `/conversations/${this.conversationId}/messages/${this.messageId}`,
    );
  }

  @given('I sign the current conversation message edition request')
  public async iSignTheCurrentConversationMessageEditionRequest(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    await this.signCurrentRequest(
      'PUT',
      `/conversations/${this.conversationId}/messages/${this.messageId}`,
    );
  }

  @given('I sign the current conversation message reaction request')
  public async iSignTheCurrentConversationMessageReactionRequest(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    await this.signCurrentRequest(
      'POST',
      `/conversations/${this.conversationId}/messages/${this.messageId}/reactions`,
    );
  }

  @given('I sign the current conversation message reaction removal request')
  public async iSignTheCurrentConversationMessageReactionRemovalRequest(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.body = await this.conversationReactionMutationBody('delete');
    await this.signCurrentRequest(
      'DELETE',
      `/conversations/${this.conversationId}/messages/${this.messageId}/reactions`,
    );
  }

  @given('I sign the current latest conversation messages request')
  public async iSignTheCurrentLatestConversationMessagesRequest(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      `/conversations/${this.conversationId}/messages`,
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

  @given('I sign the current public IPFS content request')
  public async iSignTheCurrentPublicIPFSContentRequest(): Promise<void> {
    await this.ensureAuthenticatedIdentityIsPublished();
    await this.signCurrentRequest('POST', '/ipfs/public');
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
    await this.signCurrentRequest('GET', '/ipfs/replication/status');
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
      '/ipfs/replication/status',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current conversations request')
  public async iSignTheCurrentConversationsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/conversations/');
  }

  @given('the other identity signs the current conversations request')
  public async theOtherIdentitySignsTheCurrentConversationsRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/conversations/',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I set a read conversation messages body')
  public iSetAReadConversationMessagesBody(): void {
    if (!this.messageId) {
      throw new Error('Message must be created first.');
    }

    this.body = JSON.stringify({
      messageId: this.messageId,
    });
  }

  @given(
    'the other identity signs the current read conversation messages request',
  )
  public async theOtherIdentitySignsTheCurrentReadConversationMessagesRequest(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'PUT',
      `/conversations/${this.conversationId}/messages/read-until`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current conversations request with an expired timestamp')
  public async iSignTheCurrentConversationsRequestWithAnExpiredTimestamp(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest(
      'GET',
      '/conversations/',
      String(Date.now() - 31_000),
    );
  }

  @given('I sign the current node owner request')
  public async iSignTheCurrentNodeOwnerRequest(): Promise<void> {
    this.body = this.body ?? '{}';
    await this.signCurrentRequest('PUT', '/node/owner/');
  }

  @given('another identity signs the current node owner request')
  public async anotherIdentitySignsTheCurrentNodeOwnerRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = this.body ?? '{}';
    await this.signCurrentRequest(
      'PUT',
      '/node/owner/',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('another identity signs the current node network request')
  public async anotherIdentitySignsTheCurrentNodeNetworkRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/node/networks/',
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
      '/node/networks/',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current node networks request')
  public async iSignTheCurrentNodeNetworksRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/node/networks/');
  }

  @given('I sign the current node relay configuration query')
  public async iSignTheCurrentNodeRelayConfigurationQuery(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/node/relay-configuration/');
  }

  @given('I sign the current node relay configuration request')
  public async iSignTheCurrentNodeRelayConfigurationRequest(): Promise<void> {
    await this.signCurrentRequest('PUT', '/node/relay-configuration/');
  }

  @given('another identity signs the current node relay configuration request')
  public async anotherIdentitySignsTheCurrentNodeRelayConfigurationRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'PUT',
      '/node/relay-configuration/',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current node network request')
  public async iSignTheCurrentNodeNetworkRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/node/networks/');
  }

  @given('I sign the current node public network request')
  public async iSignTheCurrentNodePublicNetworkRequest(): Promise<void> {
    this.body = this.body ?? '{}';
    await this.signCurrentRequest('POST', '/node/networks/public/');
  }

  @given(
    'I sign the current node network deletion request for network {string}',
  )
  public async iSignTheCurrentNodeNetworkDeletionRequestForNetwork(
    networkId: string,
  ): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('DELETE', `/node/networks/${networkId}/`);
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
      `/node/networks/${networkId}/`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I set a conversation invitation notification body')
  public async iSetAConversationInvitationNotificationBody(): Promise<void> {
    const inviterKeyPair = await this.ensureIdentityKeyPair();
    await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      conversationId: 'one-to-one:notification-api-conversation',
      encryptedConversationKey: 'encrypted-conversation-key',
      inviterIdentityId: this.ownerIdentityId?.valueOf(),
      inviterSignature: inviterKeyPair
        .sign('conversation-invitation')
        .valueOf(),
      recipientIdentityId: this.otherIdentityId?.valueOf(),
      type: 'conversation_invitation',
    });
  }

  @given('I set a community invitation notification body')
  public async iSetACommunityInvitationNotificationBody(): Promise<void> {
    const inviterKeyPair = await this.ensureIdentityKeyPair();
    await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      communityId: this.communityId || 'community-notification-api',
      encryptedCommunityKey: 'encrypted-community-key',
      inviterIdentityId: this.ownerIdentityId?.valueOf(),
      inviterSignature: inviterKeyPair.sign('community-invitation').valueOf(),
      recipientIdentityId: this.otherIdentityId?.valueOf(),
      type: 'community_invitation',
    });
  }

  @given('I set a group conversation invitation notification body')
  public async iSetAGroupConversationInvitationNotificationBody(): Promise<void> {
    const inviterKeyPair = await this.ensureIdentityKeyPair();
    await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      conversationId: 'group:notification-api-conversation',
      encryptedConversationKey: 'encrypted-group-conversation-key',
      inviterIdentityId: this.ownerIdentityId?.valueOf(),
      inviterSignature: inviterKeyPair
        .sign('group-conversation-invitation')
        .valueOf(),
      recipientIdentityId: this.otherIdentityId?.valueOf(),
      type: 'group_conversation_invitation',
    });
  }

  @given('I sign the current notification creation request')
  public async iSignTheCurrentNotificationCreationRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/notifications/');
  }

  @given('another identity signs the current notification creation request')
  public async anotherIdentitySignsTheCurrentNotificationCreationRequest(): Promise<void> {
    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'POST',
      '/notifications/',
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
      '/notifications/',
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current notifications request')
  public async iSignTheCurrentNotificationsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/notifications/');
  }

  @given('I sign the current notification settings request')
  public async iSignTheCurrentNotificationSettingsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/notification-settings/');
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
    await this.signCurrentRequest('POST', '/stickers/packs/');
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
    await this.signCurrentRequest('POST', '/stickers/packs/');
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
    await this.signCurrentRequest('GET', '/stickers/me');
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
      'POST',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/used`,
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
    this.response = await this.restClient.get('/stickers/me', this.headers);
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

  @when('I POST the current sticker as used')
  public async iPOSTTheCurrentStickerAsUsed(): Promise<void> {
    this.response = await this.restClient.post(
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/used`,
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
      '/notifications/',
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

  @given('I set a notification accepted body')
  public iSetANotificationAcceptedBody(): void {
    this.body = JSON.stringify({
      state: 'accepted',
    });
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

  @given('I have sent an encrypted conversation message')
  public async iHaveSentAnEncryptedConversationMessage(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    await this.iSetAnEncryptedConversationMessageBody();
    await this.iSignTheCurrentConversationMessageRequest();

    this.response = await this.restClient.post(
      `/conversations/${this.conversationId}/messages`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not send message: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.messageId = this.response.data.id;
  }

  @given('I have reacted to the sent message')
  public async iHaveReactedToTheSentMessage(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.response = await this.restClient.post(
      `/conversations/${this.conversationId}/messages/${this.messageId}/reactions`,
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not react to message: ${JSON.stringify(this.response.data)}`,
      );
    }
  }

  @given('I have created a private community text channel')
  public async iHaveCreatedAPrivateCommunityTextChannel(): Promise<void> {
    this.iSetAPrivateCommunityBody();
    await this.iSignTheCurrentCommunityCreationRequest();

    this.response = await this.restClient.post(
      '/communities/',
      JSON.parse(this.body || '{}'),
      { headers: this.headers },
    );

    if (this.response.status !== 200) {
      throw new Error(
        `Could not create community: ${JSON.stringify(this.response.data)}`,
      );
    }

    this.iRememberTheCurrentCommunity();
    this.iSetACommunityTextChannelBody();
    await this.iSignTheCurrentCommunityTextChannelRequest();

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels/text`,
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

    await Kernel.di
      .getService<NodeNetworkAdder>(NodeNetworkAdder)
      .addNetwork(
        new NodeNetworkAdderMessage(
          networkId,
          networkName,
          privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
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

  @when('I POST to the current IPFS network')
  public async iPOSTToTheCurrentIPFSNetwork(): Promise<void> {
    if (!this.currentNetworkId) {
      throw new Error('IPFS network must be registered first.');
    }

    await this.iPOSTTo(`/ipfs/${this.currentNetworkId}`);
  }

  @when('I PUT {string}')
  public async iPUT(path: string): Promise<void> {
    this.response = await this.restClient.put(
      path,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the current conversation messages read marker')
  public async iPUTTheCurrentConversationMessagesReadMarker(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    this.response = await this.restClient.put(
      `/conversations/${this.conversationId}/messages/read-until`,
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

  @when('I PATCH {string}')
  public async iPATCH(path: string): Promise<void> {
    this.response = await this.restClient.patch(
      path,
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

  @when('I POST to the current community members')
  public async iPOSTToTheCurrentCommunityMembers(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/members`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST to the current community invites')
  public async iPOSTToTheCurrentCommunityInvites(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/invites`,
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
      `/communities/${this.communityId}/join-requests`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET the current community invite')
  public async iGETTheCurrentCommunityInvite(): Promise<void> {
    if (!this.communityInviteToken) {
      throw new Error('Community invite must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/invites/${this.communityInviteToken}`,
    );
  }

  @when('I POST to accept the current community invite')
  public async iPOSTToAcceptTheCurrentCommunityInvite(): Promise<void> {
    if (!this.communityInviteToken) {
      throw new Error('Community invite must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/invites/${this.communityInviteToken}/accept`,
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
      undefined,
      { headers: this.headers },
    );
  }

  @when('I GET current communities')
  public async iGETCurrentCommunities(): Promise<void> {
    this.response = await this.restClient.get('/communities/', this.headers);
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
      `/communities/discover?query=API&networkId=${this.currentNetworkId}`,
      this.headers,
    );
  }

  @when('I GET community membership requests')
  public async iGETCommunityMembershipRequests(): Promise<void> {
    this.response = await this.restClient.get(
      '/communities/membership-requests',
      this.headers,
    );
  }

  @when('I PATCH the current community membership request')
  public async iPATCHTheCurrentCommunityMembershipRequest(): Promise<void> {
    if (!this.communityMembershipRequestId) {
      throw new Error('Community membership request must be created first.');
    }

    this.response = await this.restClient.patch(
      `/communities/membership-requests/${this.communityMembershipRequestId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET current calls')
  public async iGETCurrentCalls(): Promise<void> {
    this.response = await this.restClient.get('/calls/', this.headers);
  }

  @when('I GET current call history')
  public async iGETCurrentCallHistory(): Promise<void> {
    this.response = await this.restClient.get('/calls/history', this.headers);
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
      '/calls/ice-servers',
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

  @when('I POST a participant heartbeat to the current call')
  public async iPOSTAParticipantHeartbeatToTheCurrentCall(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    this.response = await this.restClient.post(
      `/calls/${this.callId}/participants/me/heartbeat`,
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

  @when('I POST a text channel to the current community')
  public async iPOSTATextChannelToTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.post(
      `/communities/${this.communityId}/channels/text`,
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
      `/communities/${this.communityId}/channels/voice`,
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

  @when('I search messages from the current community text channel')
  public async iSearchMessagesFromTheCurrentCommunityTextChannel(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/channels/${this.communityChannelId}/messages/search?query=searchable&limit=20`,
      this.headers,
    );
  }

  @when('I search messages from the current community')
  public async iSearchMessagesFromTheCurrentCommunity(): Promise<void> {
    if (!this.communityId) {
      throw new Error('Community must be created first.');
    }

    this.response = await this.restClient.get(
      `/communities/${this.communityId}/messages/search?query=searchable&limit=20`,
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

  @when('I GET the published IPFS content as binary')
  public async iGETThePublishedContentAsBinary(): Promise<void> {
    this.response = await this.restClient.getBinary(
      `/ipfs/${this.response.data.cid}`,
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
      `/presence/?identityIds=${encodeURIComponent(this.ownerIdentityId?.valueOf() || '')}`,
      this.headers,
    );
  }

  @when('I POST the message to the current conversation')
  public async iPostTheMessageToTheCurrentConversation(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    this.response = await this.restClient.post(
      `/conversations/${this.conversationId}/messages`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I GET latest messages from the current conversation')
  public async iGetLatestMessagesFromTheCurrentConversation(): Promise<void> {
    if (!this.conversationId) {
      throw new Error('Conversation must be created first.');
    }

    this.response = await this.restClient.get(
      `/conversations/${this.conversationId}/messages?limit=50`,
      this.headers,
    );
  }

  @when('I GET latest messages before the sent message')
  public async iGetLatestMessagesBeforeTheSentMessage(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.response = await this.restClient.get(
      `/conversations/${this.conversationId}/messages?limit=50&beforeMessageId=${this.messageId}`,
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

  @when('I GET the current device authorization checkpoint')
  public async iGetTheCurrentDeviceAuthorizationCheckpoint(): Promise<void> {
    const identityId = this.ownerIdentityId as IdentityId;
    this.response = await this.restClient.get(
      `/identity-devices/${encodeURIComponent(identityId.valueOf())}`,
      this.headers,
    );
  }

  @when('I GET current conversations')
  public async iGetCurrentConversations(): Promise<void> {
    this.response = await this.restClient.get(
      '/conversations/?limit=20',
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

  @when('I DELETE {string}')
  public async iDELETE(path: string): Promise<void> {
    this.response = await this.restClient.delete(
      path,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the sent message from the current conversation')
  public async iDELETETheSentMessageFromTheCurrentConversation(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.response = await this.restClient.delete(
      `/conversations/${this.conversationId}/messages/${this.messageId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I PUT the sent message in the current conversation')
  public async iPUTTheSentMessageInTheCurrentConversation(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.response = await this.restClient.put(
      `/conversations/${this.conversationId}/messages/${this.messageId}`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I POST the reaction to the sent message')
  public async iPOSTTheReactionToTheSentMessage(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.response = await this.restClient.post(
      `/conversations/${this.conversationId}/messages/${this.messageId}/reactions`,
      this.body && JSON.parse(this.body),
      { headers: this.headers },
    );
  }

  @when('I DELETE the reaction from the sent message')
  public async iDELETETheReactionFromTheSentMessage(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    this.response = await this.restClient.delete(
      `/conversations/${this.conversationId}/messages/${this.messageId}/reactions`,
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

  @then('both concurrent call responses contain the same participants')
  public bothConcurrentCallResponsesContainTheSameParticipants(): void {
    if (!this.ownerIdentityId || !this.otherIdentityId) {
      throw new Error('Both community identities must exist first.');
    }

    const [firstResponse, secondResponse] = this.concurrentCallResponses;
    const expectedParticipantIds = [
      this.ownerIdentityId.valueOf(),
      this.otherIdentityId.valueOf(),
    ];

    expect(firstResponse.status).to.equal(200);
    expect(secondResponse.status).to.equal(200);
    expect(secondResponse.data.id).to.equal(firstResponse.data.id);
    expect(firstResponse.data.participantIds).to.contain(
      this.ownerIdentityId.valueOf(),
    );
    expect(secondResponse.data.participantIds).to.contain(
      this.otherIdentityId.valueOf(),
    );
    expect(
      this.concurrentCallResponses.some((response) => {
        const participantIds = response.data.participantIds;

        return (
          Array.isArray(participantIds) &&
          expectedParticipantIds.every((participantId) =>
            participantIds.includes(participantId),
          )
        );
      }),
    ).to.equal(true);
  }

  @then('both community members can list the concurrent call')
  public async bothCommunityMembersCanListTheConcurrentCall(): Promise<void> {
    if (!this.callId || !this.ownerIdentityId || !this.otherIdentityId) {
      throw new Error('The concurrent call and both identities must exist.');
    }

    this.body = undefined;
    await this.signCurrentRequest('GET', '/calls/');
    const ownerHeaders = { ...this.headers };
    const otherIdentityKeyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'GET',
      '/calls/',
      String(Date.now()),
      otherIdentityKeyPair,
      this.otherIdentityId,
    );
    const otherHeaders = { ...this.headers };
    const responses = await Promise.all([
      this.restClient.get('/calls/', { headers: ownerHeaders }),
      this.restClient.get('/calls/', { headers: otherHeaders }),
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
      const participantIds =
        typeof currentCall === 'object' &&
        currentCall !== null &&
        'participantIds' in currentCall
          ? currentCall.participantIds
          : undefined;

      expect(participantIds).to.have.members([
        this.ownerIdentityId.valueOf(),
        this.otherIdentityId.valueOf(),
      ]);
    }
  }

  @then('response body should contain')
  public responseBodyShouldContainObject(objectToContain: string): void {
    expect(JSON.stringify(this.response.data)).to.contain(objectToContain);
  }

  @then('response body should not contain {string}')
  public responseBodyShouldnotContain(textToContain: string): void {
    expect(JSON.stringify(this.response.data)).to.not.contain(textToContain);
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

  @then('response header {string} should not exist')
  public responseHeaderShouldNotExist(headerName: string): void {
    const actualValue = this.response.headers[headerName.toLowerCase()];
    expect(actualValue).to.be.undefined(
      `Header ${headerName} should not exist but found: ${actualValue}`,
    );
  }

  @then('response does not contain property {string}')
  public responseDoesNotContainProperty(property: string): void {
    expect(this.response.data).to.not.have.property(property);
  }
}
