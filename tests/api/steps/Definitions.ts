/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable no-case-declarations */
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MessageType } from '@app/contexts/conversations/domain/value-objects/MessageType';
import { MongoNodeMetadataDocument } from '@app/contexts/nodes/infrastructure/mongo/documents/MongoNodeMetadataDocument';
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
import { generateKeyPairSync } from 'crypto';
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
  private formData: FormData | undefined;
  private headers: Record<string, string> = {};
  private identityKeyPair: KeyPair | undefined;

  private conversationId: string | undefined;
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

  @before()
  public resetScenarioState(): void {
    this.binaryBody = undefined;
    this.body = undefined;
    this.formData = undefined;
    this.headers = {};
    this.identityKeyPair = undefined;
    this.conversationId = undefined;
    this.createdIdentityId = undefined;
    this.keychainExternalIdentifier = undefined;
    this.messageId = undefined;
    this.notificationId = undefined;
    this.otherIdentityId = undefined;
    this.otherIdentityKeyPair = undefined;
    this.ownerIdentityId = undefined;
    this.response = null;
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
        .map((network) => networkRegistry.removeNetwork(network.getName())),
    );
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
    const networks = ['123e4567-e89b-12d3-a456-426614174000'];
    const normalizedHandle = handle.replace(/^@/, '').toLowerCase();
    const profile: {
      biography: string | undefined;
      handle: string;
      name: string;
      picture: string | undefined;
    } = {
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
    const ownerIdentityId = this.ownerIdentityId as IdentityId;

    this.body = JSON.stringify({
      keychainExternalIdentifier: this.keychainExternalIdentifier,
      participantIds: [ownerIdentityId.valueOf(), participantIdentityId.valueOf()],
      type: 'one-to-one',
    });
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
      targetMessageId: undefined as string | undefined,
      type: MessageType.SENT.valueOf(),
    };

    this.body = JSON.stringify({
      attachmentExternalIdentifiers: [],
      createdAt,
      encryptedPayload: 'encrypted-message-payload',
      id,
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
    'I set public IPFS content with content type {string} and text {string}',
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

  @given('I sign the current conversations request')
  public async iSignTheCurrentConversationsRequest(): Promise<void> {
    this.body = undefined;
    await this.signCurrentRequest('GET', '/conversations/');
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

  @given('I register an in-memory IPFS network {string}')
  public async iRegisterAnInMemoryIPFSNetwork(
    networkName: string,
  ): Promise<void> {
    await this.ipfsDefinition.registerInMemoryNetwork(networkName);
  }

  @given(
    'I register an in-memory IPFS network with id {string} and name {string}',
  )
  public async iRegisterAnInMemoryIPFSNetworkWithIdAndName(
    networkId: string,
    networkName: string,
  ): Promise<void> {
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

    if (this.response.data?.id) {
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

  @when('I GET {string}')
  public async iGET(path: string): Promise<void> {
    this.response = await this.restClient.get(path, this.headers);
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
    this.response = await this.restClient.delete(path);
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

  @then('response body should contain')
  public responseBodyShouldContainObject(objectToContain: string): void {
    expect(JSON.stringify(this.response.data)).to.contain(objectToContain);
  }

  @then('response body should not contain {string}')
  public responseBodyShouldnotContain(textToContain: string): void {
    expect(JSON.stringify(this.response.data)).to.not.contain(textToContain);
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
