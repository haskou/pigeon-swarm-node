/* eslint-disable no-case-declarations */
import Kernel from '@app/Kernel';
import { DataTable } from '@cucumber/cucumber';
import { expect } from 'chai';
import * as chai from 'chai';
import chaiSubset from 'chai-subset';
import { binding, given, then, when, before } from 'cucumber-tsflow';
import FormData from 'form-data';
import { ObjectId } from 'mongodb';

import RestClient from './RestClient';

chai.use(chaiSubset);

let kernel: Kernel = null;

@binding()
export default class Definitions {
  private body: string;
  private formData: FormData;
  private headers: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private response: any = null;
  private restClient: RestClient = new RestClient();

  @before()
  public async startKernel(): Promise<void> {
    if (!kernel) {
      kernel = new Kernel();
      kernel.environmentVariables('test');
      await kernel.dependencyInjection();
      await kernel.runServer();
      kernel.logs();
    }
  }

  @given('I am an anonymous user')
  public iAmAnAnonymousUser(): void {
    return;
  }

  @given('I set json body')
  public iSetJsonBody(body: string) {
    this.body = body;
  }

  @given('I set header {string} to {string}')
  public iSetHeaderTo(header: string, value: string) {
    this.headers[header] = value;
  }

  @when('I POST to {string}')
  public async iPOSTTo(path: string) {
    const isFormData = this.formData !== undefined;
    this.response = await this.restClient.post(
      path,
      isFormData ? this.formData : this.body && JSON.parse(this.body),
      isFormData ? { headers: this.formData.getHeaders() } : this.headers,
    );
  }

  @when('I PUT {string}')
  public async iPUT(path: string) {
    this.response = await this.restClient.put(path, this.body);
  }

  @when('I PATCH {string}')
  public async iPATCH(path: string) {
    this.response = await this.restClient.patch(path, this.body);
  }

  @when('I GET {string}')
  public async iGET(path: string) {
    this.response = await this.restClient.get(path, this.headers);
  }

  @when('I DELETE {string}')
  public async iDELETE(path: string) {
    this.response = await this.restClient.delete(path);
  }

  @then('response code is equal to {int}')
  public responseCodeIsEqualTo(statusCode: number) {
    expect(this.response.status).to.equal(
      statusCode,
      JSON.stringify(this.response.data),
    );
  }

  @then('response body should contain {string}')
  public responseBodyShouldContain(textToContain: string) {
    expect(JSON.stringify(this.response.data)).to.contain(
      textToContain,
      JSON.stringify(this.response.data),
    );
  }

  @then('response body should contain')
  public responseBodyShouldContainObject(objectToContain: string) {
    expect(JSON.stringify(this.response.data)).to.contain(objectToContain);
  }

  @then('response body should not contain {string}')
  public responseBodyShouldnotContain(textToContain: string) {
    expect(JSON.stringify(this.response.data)).to.not.contain(textToContain);
  }

  @then('response body is an array with length of {int}')
  public responseBodyIsAnArrayWithLengthOf(arrayLength: number) {
    expect(this.response.data.results ?? this.response.data).to.have.lengthOf(
      arrayLength,
    );
  }

  @then('response body should be empty')
  public responseBodyShouldBeEmpty() {
    expect(this.response.data).to.equal('');
  }

  @then('response contains a valid resource with the following fields')
  public responseContainsValidResource(table: DataTable) {
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
  ) {
    expect(this.response.data.results[index])
      .to.have.property(property)
      .that.equals(value);
  }

  @then('response data should match partially')
  public responseDataShouldMatchPartially(expectedData: string) {
    expect(this.response.data).to.containSubset(JSON.parse(expectedData));
  }

  @then('response data should match exactly')
  public responseDataShouldMatchExactly(expectedData: string) {
    expect(this.response.data).to.deep.equal(JSON.parse(expectedData));
  }

  @then('response header {string} should be {string}')
  public responseHeaderShouldBe(headerName: string, expectedValue: string) {
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
  ) {
    const actualValue = this.response.headers[headerName.toLowerCase()];
    expect(actualValue).to.contain(
      expectedValue,
      `Header ${headerName} does not contain expected value. Expected to contain: ${expectedValue}, Actual: ${actualValue}`,
    );
  }

  @then('response header {string} should not exist')
  public responseHeaderShouldNotExist(headerName: string) {
    const actualValue = this.response.headers[headerName.toLowerCase()];
    expect(actualValue).to.be.undefined(
      `Header ${headerName} should not exist but found: ${actualValue}`,
    );
  }

  @then('response does not contain property {string}')
  public responseDoesNotContainProperty(property: string) {
    expect(this.response.data).to.not.have.property(property);
  }

  @then('the document {string} from {string} has')
  public async documentHas(id: string, collection: string, table: DataTable) {
    const dbGlobal = await mongoMock.getDomainDb('dev');
    const document = await dbGlobal.collection(collection).findOne({
      _id: new ObjectId(id),
    });
    const rows = table.rows();
    for (const row of rows) {
      const fieldPath = row[0];
      const expectedValue = row[1];

      const pathParts = fieldPath.split('.');
      let actualValue = document;

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
}
