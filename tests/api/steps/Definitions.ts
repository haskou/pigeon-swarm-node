/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable no-case-declarations */
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { MongoNodeMetadataDocument } from '@app/contexts/nodes/infrastructure/mongo/documents/MongoNodeMetadataDocument';
import { MongoNodePeerDocument } from '@app/contexts/nodes/infrastructure/mongo/documents/MongoNodePeerDocument';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Kernel from '@app/Kernel';
import { DataTable, setDefaultTimeout } from '@cucumber/cucumber';
import { KeyPair } from '@haskou/value-objects';
import { expect } from 'chai';
import * as chai from 'chai';
import chaiSubset from 'chai-subset';
import { generateKeyPairSync, randomUUID } from 'crypto';
import { after, before, binding, given, then, when } from 'cucumber-tsflow';
import FormData from 'form-data';

import IPFSDefinition from './IPFSDefinition';
import RestClient from './RestClient';

chai.use(chaiSubset);

setDefaultTimeout(20_000);

let kernel: Kernel | null = null;

@binding()
export default class Definitions {
  private binaryBody: Buffer | undefined;
  private body: string | undefined;
  private callId: string | undefined;
  private communityChannelId: string | undefined;
  private communityChannelMessageId: string | undefined;
  private communityId: string | undefined;
  private communityInviteToken: string | undefined;
  private communityMembershipRequestId: string | undefined;
  private formData: FormData | undefined;
  private headers: Record<string, string> = {};
  private identityKeyPair: KeyPair | undefined;

  private conversationId: string | undefined;
  private currentNetworkId: string | undefined;
  private createdIdentityId: string | undefined;
  private keychainExternalIdentifier: string | undefined;
  private messageId: string | undefined;
  private notificationId: string | undefined;
  private otherIdentityId: IdentityId | undefined;
  private otherIdentityKeyPair: KeyPair | undefined;

  private ownerIdentityId: IdentityId | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private response: any = null;
  private restClient: RestClient = new RestClient();
  private readonly ipfsDefinition: IPFSDefinition = new IPFSDefinition();
  private stickerPackId: string | undefined;
  private stickerId: string | undefined;

  @before()
  public resetScenarioState(): void {
    this.binaryBody = undefined;
    this.body = undefined;
    this.callId = undefined;
    this.communityChannelId = undefined;
    this.communityChannelMessageId = undefined;
    this.communityId = undefined;
    this.communityInviteToken = undefined;
    this.communityMembershipRequestId = undefined;
    this.formData = undefined;
    this.headers = {};
    this.identityKeyPair = undefined;
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
    if (!kernel) {
      kernel = new Kernel();
      kernel.environmentVariables('test');
      this.ipfsDefinition.cleanupStorageFolder(process.env.IPFS_STORAGE_PATH);

      await kernel.dependencyInjection();
      await kernel.runServer();
      kernel.logs();
    }
  }

  @after()
  public async cleanupMemoryStorage(): Promise<void> {
    await this.ipfsDefinition.cleanupRegisteredNetworks();
    this.ipfsDefinition.cleanupStorageFolder(process.env.IPFS_STORAGE_PATH);
  }

  @given('I am an anonymous user')
  public iAmAnAnonymousUser(): void {
    return;
  }

  @given('the local node has no owner and no networks')
  public async theLocalNodeHasNoOwnerAndNoNetworks(): Promise<void> {
    const mongo = Kernel.di.getService<MongoDB>(MongoDB);
    const collection =
      await mongo.getCollection<MongoNodeMetadataDocument>('node_metadata');
    const networkRegistry =
      Kernel.di.getService<IPFSNetworkRegistry>(IPFSNetworkRegistry);

    await collection.deleteOne({ _id: 'local' });
    await Promise.all(
      networkRegistry
        .getAll()
        .map((network) => networkRegistry.removeNetwork(network.getId())),
    );
  }

  @given('a node peer heartbeat has been received')
  public async aNodePeerHeartbeatHasBeenReceived(): Promise<void> {
    const mongo = Kernel.di.getService<MongoDB>(MongoDB);
    const collection =
      await mongo.getCollection<MongoNodePeerDocument>('node_peers');
    const ownerKeyPair = await KeyPair.generate();
    const ownerIdentityId = new IdentityId(
      ownerKeyPair.toPrimitives().publicKey,
    );

    await collection.deleteMany({});
    await collection.insertOne({
      _id: '550e8400-e29b-41d4-a716-446655440010',
      lastSeenAt: Date.now(),
      networks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          name: 'public',
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

  private async buildClientSignedIdentityBody(
    name: string,
    handle: string,
    password: string,
    version: number = 1,
    previousIdentityExternalIdentifier: string | undefined = undefined,
  ): Promise<void> {
    const keyPair = await this.ensureIdentityKeyPair();
    const ownerIdentityId = this.ownerIdentityId as IdentityId;
    const encryptedKeyPair = await keyPair.encryptKeyPair(password);
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
      encryptedKeyPair: encryptedKeyPair.toPrimitives(),
      id: ownerIdentityId.valueOf(),
      networks,
      previousIdentityExternalIdentifier,
      profile,
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
    const ownerIdentityId = this.ownerIdentityId ?? new IdentityId(
      (await this.ensureIdentityKeyPair()).toPrimitives().publicKey,
    );

    if (this.createdIdentityId === ownerIdentityId.valueOf()) {
      return;
    }

    await this.buildClientSignedIdentityBody(
      'Test Identity',
      'test-identity',
      'Client-secret1!',
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

  private async signCurrentRequest(
    method: string,
    path: string,
    timestamp: string = String(Date.now()),
    keyPair: KeyPair | undefined = undefined,
    identityId: IdentityId | undefined = undefined,
  ): Promise<void> {
    const signerKeyPair = keyPair ?? (await this.ensureIdentityKeyPair());
    const signerIdentityId = identityId ?? this.ownerIdentityId;
    const nonce = `api-nonce-${timestamp}-${Math.random()}`;
    const verifier = new SignedHttpRequestVerifier();
    const signedRequestPayload = verifier.getCanonicalPayload(
      method,
      path,
      timestamp,
      nonce,
      this.binaryBody ?? (this.body ? JSON.parse(this.body) : {}),
    );

    this.headers['x-identity-id'] = signerIdentityId?.valueOf() || '';
    this.headers['x-timestamp'] = timestamp;
    this.headers['x-nonce'] = nonce;
    this.headers['x-signature'] = signerKeyPair
      .sign(JSON.stringify(signedRequestPayload))
      .valueOf();
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

  @given(
    'I set a client-signed identity body with name {string} and handle {string}',
  )
  public async iSetAClientSignedIdentityBody(
    name: string,
    handle: string,
  ): Promise<void> {
    await this.buildClientSignedIdentityBody(
      name,
      handle,
      'client-secret-password',
    );
  }

  @given(
    'I set a client-signed identity update body with name {string}, handle {string} and password {string}',
  )
  public async iSetAClientSignedIdentityUpdateBody(
    name: string,
    handle: string,
    password: string,
  ): Promise<void> {
    const previousIdentityExternalIdentifier =
      await this.findCreatedIdentityExternalIdentifier();

    await this.buildClientSignedIdentityBody(
      name,
      handle,
      password,
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
      avatar: 'bafybeigcommunityavatar',
      banner: 'bafybeigcommunitybanner',
      description: 'Private API community',
      name: 'API community',
      networkId: this.currentNetworkId,
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

  @given('the community member signs the current community invite accept request')
  public async theCommunityMemberSignsTheCurrentCommunityInviteAcceptRequest(): Promise<void> {
    if (!this.communityInviteToken) {
      throw new Error('Community invite must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
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

    this.body = undefined;
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
    if (!this.communityMembershipRequestId) {
      throw new Error('Community membership request must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    await this.signCurrentRequest(
      'PATCH',
      `/communities/membership-requests/${this.communityMembershipRequestId}`,
      String(Date.now()),
      keyPair,
      this.otherIdentityId,
    );
  }

  @given('I sign the current community membership requests request')
  public async iSignTheCurrentCommunityMembershipRequestsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/communities/membership-requests');
  }

  @given('I sign the current membership request update')
  public async iSignTheCurrentMembershipRequestUpdate(): Promise<void> {
    if (!this.communityMembershipRequestId) {
      throw new Error('Community membership request must be created first.');
    }

    await this.signCurrentRequest(
      'PATCH',
      `/communities/membership-requests/${this.communityMembershipRequestId}`,
    );
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
  }

  @given('I remember the current community voice channel')
  public iRememberTheCurrentCommunityVoiceChannel(): void {
    if (!this.response?.data?.id) {
      throw new Error('Community channel response id not found.');
    }

    this.communityChannelId = this.response.data.id;
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

    this.body = undefined;
    await this.signCurrentRequest(
      'DELETE',
      `/communities/${this.communityId}/channels/${this.communityChannelId}`,
    );
  }

  @given('another identity signs the current community channel deletion request')
  public async anotherIdentitySignsTheCurrentCommunityChannelDeletionRequest(): Promise<void> {
    if (!this.communityId || !this.communityChannelId) {
      throw new Error('Community and channel must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
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

    const keyPair = await this.ensureIdentityKeyPair();
    const id = `community-message:${Date.now()}:${randomUUID()}`;
    const createdAt = Date.now();
    const payload = {
      attachmentExternalIdentifiers: [] as string[],
      authorIdentityId: this.ownerIdentityId?.valueOf() || '',
      channelId: this.communityChannelId,
      communityId: this.communityId,
      createdAt,
      encryptedPayload: 'encrypted-community-channel-message-payload',
      id,
      type: 'sent',
    };

    this.body = JSON.stringify({
      attachmentExternalIdentifiers: [],
      createdAt,
      encryptedPayload: 'encrypted-community-channel-message-payload',
      id,
      signature: keyPair.sign(JSON.stringify(payload)).valueOf(),
    });
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

    const keyPair = await this.ensureIdentityKeyPair();
    const id = `community-message:${Date.now()}:${randomUUID()}:deleted`;
    const createdAt = Date.now();
    const payload = {
      actorIdentityId: this.ownerIdentityId?.valueOf() || '',
      channelId: this.communityChannelId,
      communityId: this.communityId,
      createdAt,
      id,
      targetMessageId: this.communityChannelMessageId,
      type: 'deleted',
    };

    this.body = JSON.stringify({
      createdAt,
      id,
      signature: keyPair.sign(JSON.stringify(payload)).valueOf(),
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

  @given('I set a community channel message reaction body')
  public iSetACommunityChannelMessageReactionBody(): void {
    this.body = JSON.stringify({
      emoji: '👍',
    });
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
    await this.iHavePublishedAKeychainForTheAuthenticatedIdentity();
    await this.iSetAGroupConversationBodyForNewParticipants();
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

  @given('the other identity signs the current call heartbeat request')
  public async theOtherIdentitySignsTheCurrentCallHeartbeatRequest(): Promise<void> {
    if (!this.callId) {
      throw new Error('Call must be created first.');
    }

    const keyPair = await this.ensureOtherIdentityKeyPair();

    this.body = undefined;
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
    const keyPair = await this.ensureIdentityKeyPair();
    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();
    const payload = {
      attachmentExternalIdentifiers: [] as string[],
      authorId: this.ownerIdentityId?.valueOf() || '',
      conversationId: this.conversationId || '',
      createdAt,
      encryptedPayload: 'encrypted-message-payload',
      id,
      previousMessageIds: [] as string[],
      replyToMessageId: undefined as string | undefined,
      targetMessageId: undefined as string | undefined,
      type: MessageType.SENT.valueOf(),
    };

    this.body = JSON.stringify({
      attachmentExternalIdentifiers: [],
      createdAt,
      encryptedPayload: 'encrypted-message-payload',
      id,
      previousMessageIds: [],
      signature: keyPair.sign(JSON.stringify(payload)).valueOf(),
    });
  }

  @given('I set an encrypted conversation reply body')
  public async iSetAnEncryptedConversationReplyBody(): Promise<void> {
    if (!this.messageId) {
      throw new Error('Message must be created first.');
    }

    const keyPair = await this.ensureIdentityKeyPair();
    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();
    const payload = {
      attachmentExternalIdentifiers: [] as string[],
      authorId: this.ownerIdentityId?.valueOf() || '',
      conversationId: this.conversationId || '',
      createdAt,
      encryptedPayload: 'encrypted-reply-payload',
      id,
      previousMessageIds: [this.messageId],
      replyToMessageId: this.messageId,
      targetMessageId: undefined as string | undefined,
      type: MessageType.SENT.valueOf(),
    };

    this.body = JSON.stringify({
      attachmentExternalIdentifiers: [],
      createdAt,
      encryptedPayload: 'encrypted-reply-payload',
      id,
      previousMessageIds: [this.messageId],
      replyToMessageId: this.messageId,
      signature: keyPair.sign(JSON.stringify(payload)).valueOf(),
    });
  }

  @given('I set an invalid encrypted conversation message body')
  public async iSetAnInvalidEncryptedConversationMessageBody(): Promise<void> {
    await this.iSetAnEncryptedConversationMessageBody();

    const invalidKeyPair = await KeyPair.generate();
    const parsedBody = JSON.parse(this.body || '{}');

    this.body = JSON.stringify({
      ...parsedBody,
      signature: invalidKeyPair.sign('invalid-message-payload').valueOf(),
    });
  }

  @given('I set a delete conversation message body')
  public async iSetADeleteConversationMessageBody(): Promise<void> {
    if (!this.conversationId || !this.messageId) {
      throw new Error('Conversation and message must be created first.');
    }

    const keyPair = await this.ensureIdentityKeyPair();
    const id = MessageId.generate().valueOf();
    const createdAt = Date.now();
    const payload = {
      attachmentExternalIdentifiers: [] as string[],
      authorId: this.ownerIdentityId?.valueOf() || '',
      conversationId: this.conversationId,
      createdAt,
      encryptedPayload: undefined as string | undefined,
      id,
      previousMessageIds: [this.messageId],
      targetMessageId: this.messageId,
      type: MessageType.DELETED.valueOf(),
    };

    this.body = JSON.stringify({
      createdAt,
      id,
      signature: keyPair.sign(JSON.stringify(payload)).valueOf(),
    });
  }

  @given('I set a conversation message reaction body')
  public iSetAConversationMessageReactionBody(): void {
    this.body = JSON.stringify({
      emoji: '👍',
    });
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

  @given(
    'I set raw IPFS content with content type {string} and text {string}',
  )
  public iSetPublicIPFSContent(contentType: string, text: string): void {
    this.binaryBody = Buffer.from(text);
    this.headers['content-type'] = contentType;
    this.headers['x-filename'] = 'avatar.png';
  }

  @given('I sign the current public IPFS content request')
  public async iSignTheCurrentPublicIPFSContentRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/ipfs/public');
  }

  @given('I sign the current private IPFS content request')
  public async iSignTheCurrentPrivateIPFSContentRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/ipfs/private');
  }

  @given('I sign the current secure IPFS content request')
  public async iSignTheCurrentSecureIPFSContentRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/ipfs/secure');
  }

  @given('I sign the current IPFS replication status request')
  public async iSignTheCurrentIPFSReplicationStatusRequest(): Promise<void> {
    this.binaryBody = undefined;
    this.body = undefined;
    await this.signCurrentRequest('GET', '/ipfs/replication/status');
  }

  @given('another identity signs the current IPFS replication status request')
  public async anotherIdentitySignsTheCurrentIPFSReplicationStatusRequest(): Promise<void> {
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

  @given('the other identity signs the current read conversation messages request')
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
      String(Date.now() - 10 * 60 * 1000),
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

  @given('I sign the current node network request')
  public async iSignTheCurrentNodeNetworkRequest(): Promise<void> {
    await this.signCurrentRequest('POST', '/node/networks/');
  }

  @given('I set a conversation invitation notification body')
  public async iSetAConversationInvitationNotificationBody(): Promise<void> {
    const inviterKeyPair = await this.ensureIdentityKeyPair();
    await this.ensureOtherIdentityKeyPair();

    this.body = JSON.stringify({
      conversationId: 'one-to-one:notification-api-conversation',
      encryptedConversationKey: 'encrypted-conversation-key',
      inviterIdentityId: this.ownerIdentityId?.valueOf(),
      inviterSignature: inviterKeyPair.sign('conversation-invitation').valueOf(),
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

  @given('I sign the current push subscription request')
  public async iSignTheCurrentPushSubscriptionRequest(): Promise<void> {
    await this.signCurrentRequest('PUT', '/push/subscriptions');
  }

  @given('I sign the current push subscription removal request')
  public async iSignTheCurrentPushSubscriptionRemovalRequest(): Promise<void> {
    await this.signCurrentRequest('DELETE', '/push/subscriptions');
  }

  @given('I set a sticker pack body')
  public iSetAStickerPackBody(): void {
    this.body = JSON.stringify({
      name: 'API stickers',
    });
  }

  @given('I sign the current sticker pack creation request')
  public async iSignTheCurrentStickerPackCreationRequest(): Promise<void> {
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
    await this.signCurrentRequest(
      'POST',
      `/stickers/packs/${this.stickerPackId}/stickers`,
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
    this.body = JSON.stringify({});
    await this.signCurrentRequest(
      'PUT',
      `/stickers/packs/${this.stickerPackId}/saved`,
    );
  }

  @given('I sign the current saved sticker pack removal request')
  public async iSignTheCurrentSavedStickerPackRemovalRequest(): Promise<void> {
    this.body = JSON.stringify({});
    await this.signCurrentRequest(
      'DELETE',
      `/stickers/packs/${this.stickerPackId}/saved`,
    );
  }

  @given('I sign the current favorite sticker request')
  public async iSignTheCurrentFavoriteStickerRequest(): Promise<void> {
    this.body = JSON.stringify({});
    await this.signCurrentRequest(
      'PUT',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/favorite`,
    );
  }

  @given('I sign the current favorite sticker removal request')
  public async iSignTheCurrentFavoriteStickerRemovalRequest(): Promise<void> {
    this.body = JSON.stringify({});
    await this.signCurrentRequest(
      'DELETE',
      `/stickers/packs/${this.stickerPackId}/stickers/${this.stickerId}/favorite`,
    );
  }

  @given('I sign the current used sticker request')
  public async iSignTheCurrentUsedStickerRequest(): Promise<void> {
    this.body = JSON.stringify({});
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

  @given('the notification recipient signs the current notification patch request')
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

  @given(
    'I set a private node network body with id {string} and name {string}',
  )
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

  @given('I register an in-memory IPFS network {string}')
  public async iRegisterAnInMemoryIPFSNetwork(
    networkName: string,
  ): Promise<void> {
    this.currentNetworkId =
      await this.ipfsDefinition.registerInMemoryNetwork(networkName);
  }

  @given(
    'I register an in-memory IPFS network with id {string} and name {string}',
  )
  public async iRegisterAnInMemoryIPFSNetworkWithIdAndName(
    networkId: string,
    networkName: string,
  ): Promise<void> {
    this.currentNetworkId =
      await this.ipfsDefinition.registerInMemoryNetworkWithId(
      networkId,
      networkName,
    );
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
    const isFormData = this.formData !== undefined;
    this.response = await this.restClient.post(
      path,
      isFormData
        ? this.formData
        : this.binaryBody ?? (this.body && JSON.parse(this.body)),
      isFormData ? { headers: this.formData?.getHeaders() } : {
        headers: this.headers,
      },
    );

    if (this.response?.data?.id) {
      this.createdIdentityId = this.response.data.id;
    }
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
    this.response = await this.restClient.get(
      '/communities/',
      this.headers,
    );
  }

  @when('I GET discoverable communities')
  public async iGETDiscoverableCommunities(): Promise<void> {
    this.response = await this.restClient.get(
      '/communities/discover?query=API',
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
      undefined,
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
  public async iGETThePublishedIPFSContentAsBinary(): Promise<void> {
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
    expect(Buffer.from(this.response.data).toString()).to.equal(expectedBody);
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

    expect(JSON.stringify(this.response.data)).to.not.contain(
      this.communityId,
    );
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

  @then('response contains a valid resource with the following fields')
  public responseContainsValidResource(table: DataTable): void {
    const rows = table.rows();
    for (const row of rows) {
      const fieldPath = row[0];
      const expectedValue = row[1];

      const pathParts = fieldPath.split('.');
      let actualValue = this.response.data;

      for (const part of pathParts) {
        if (part.includes('[') && part.includes(']')) {
          const index = parseInt(
            part.substring(part.indexOf('[') + 1, part.indexOf(']')),
            10,
          );

          // Handle case where path starts with [index] (direct array access)
          if (part.startsWith('[')) {
            actualValue = actualValue[index];
          } else {
            // Handle case where path is arrayName[index]
            const arrayName = part.substring(0, part.indexOf('['));
            actualValue = actualValue[arrayName][index];
          }
        } else {
          actualValue = actualValue[part];
        }
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
