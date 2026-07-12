import FormData from 'form-data';

import { RestHeaders } from './RestHeaders';
import { RestResponse } from './RestResponse';
import { RestResponseData } from './RestResponseData';

export default class RestClient {
  private readonly baseUrl: string;
  public bearerToken: string | null = null;

  constructor() {
    const port = process.env.API_PORT || '8081';
    this.baseUrl = `http://localhost:${port}`;
  }

  private getHeaders(input: RestHeaders = {}): Record<string, string> {
    const headers = (
      'headers' in input ? input.headers || {} : input
    ) as Record<string, string>;

    return {
      ...(this.bearerToken
        ? { Authorization: `Bearer ${this.bearerToken}` }
        : {}),
      ...headers,
    };
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    headers: RestHeaders = {},
    binary: boolean = false,
  ): Promise<RestResponse> {
    const requestHeaders = this.getHeaders(headers);
    let requestBody: BodyInit | undefined;

    if (body instanceof FormData) {
      Object.assign(requestHeaders, body.getHeaders());
      requestBody = body as unknown as BodyInit;
    } else if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      requestBody = body as unknown as BodyInit;
    } else if (body !== undefined) {
      requestHeaders['content-type'] ??= 'application/json';
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      body: requestBody,
      headers: requestHeaders,
      method,
    });

    const data = binary
      ? this.asResponseData(Buffer.from(await response.arrayBuffer()))
      : await this.readResponseData(response);

    return {
      data,
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
      statusText: response.statusText,
    };
  }

  private asResponseData(value: unknown): RestResponseData {
    return value as RestResponseData;
  }

  private async readResponseData(
    response: Response,
  ): Promise<RestResponseData> {
    const text = await response.text();

    if (!text) {
      return '' as unknown as RestResponseData;
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return text as unknown as RestResponseData;
    }

    return JSON.parse(text) as RestResponseData;
  }

  public async get(
    path: string,
    headers: RestHeaders = {},
  ): Promise<RestResponse> {
    return this.request('GET', path, undefined, headers);
  }

  public async getBinary(
    path: string,
    headers: RestHeaders = {},
  ): Promise<RestResponse> {
    return this.request('GET', path, undefined, headers, true);
  }

  public async post(
    path: string,
    data?: unknown,
    headers: RestHeaders = {},
  ): Promise<RestResponse> {
    return this.request('POST', path, data, headers);
  }

  public async patch(
    path: string,
    data?: unknown,
    headers: RestHeaders = {},
  ): Promise<RestResponse> {
    return this.request('PATCH', path, data, headers);
  }

  public async put(
    path: string,
    data?: unknown,
    headers: RestHeaders = {},
  ): Promise<RestResponse> {
    return this.request('PUT', path, data, headers);
  }

  public async delete(
    path: string,
    data?: unknown,
    headers: RestHeaders = {},
  ): Promise<RestResponse> {
    return this.request('DELETE', path, data, headers);
  }
}
