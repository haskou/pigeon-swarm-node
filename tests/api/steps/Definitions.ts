/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable no-case-declarations */
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Kernel from '@app/Kernel';
import { DataTable, setDefaultTimeout } from '@cucumber/cucumber';
import { KeyPair } from '@haskou/value-objects';
import { expect } from 'chai';
import * as chai from 'chai';
import chaiSubset from 'chai-subset';
import { after, before, binding, given, then, when } from 'cucumber-tsflow';
import FormData from 'form-data';

import IPFSDefinition from './IPFSDefinition';
import RestClient from './RestClient';

chai.use(chaiSubset);

setDefaultTimeout(20_000);

let kernel: Kernel | null = null;

@binding()
export default class Definitions {
  private body: string | undefined;
  private formData: FormData | undefined;
  private headers: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private response: any = null;
  private restClient: RestClient = new RestClient();
  private readonly ipfsDefinition: IPFSDefinition = new IPFSDefinition();

  @before()
  public resetScenarioState(): void {
    this.body = undefined;
    this.formData = undefined;
    this.headers = {};
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

  @given('I set json body')
  public iSetJsonBody(body: string): void {
    this.body = body;
  }

  @given('I set header {string} to {string}')
  public iSetHeaderTo(header: string, value: string): void {
    this.headers[header] = value;
  }

  @given('I sign the current keychain publication request')
  public async iSignTheCurrentKeychainPublicationRequest(): Promise<void> {
    if (!this.body) {
      throw new Error('Body must be set before signing the request.');
    }

    const keyPair = await KeyPair.generate();
    const ownerIdentityId = new IdentityId(keyPair.toPrimitives().publicKey);
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
    const timestamp = String(Date.now());
    const nonce = 'api-keychain-nonce';
    const verifier = new SignedHttpRequestVerifier();
    const signedRequestPayload = verifier.getCanonicalPayload(
      'POST',
      '/keychains/',
      timestamp,
      nonce,
      signedBody,
    );

    this.body = JSON.stringify(signedBody);
    this.headers['x-identity-id'] = ownerIdentityId.valueOf();
    this.headers['x-timestamp'] = timestamp;
    this.headers['x-nonce'] = nonce;
    this.headers['x-signature'] = keyPair
      .sign(JSON.stringify(signedRequestPayload))
      .valueOf();
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
      isFormData ? this.formData : this.body && JSON.parse(this.body),
      isFormData ? { headers: this.formData?.getHeaders() } : {
        headers: this.headers,
      },
    );
  }

  @when('I PUT {string}')
  public async iPUT(path: string): Promise<void> {
    this.response = await this.restClient.put(
      path,
      this.body && JSON.parse(this.body),
    );
  }

  @when('I PATCH {string}')
  public async iPATCH(path: string): Promise<void> {
    this.response = await this.restClient.patch(
      path,
      this.body && JSON.parse(this.body),
    );
  }

  @when('I GET {string}')
  public async iGET(path: string): Promise<void> {
    this.response = await this.restClient.get(path, this.headers);
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
