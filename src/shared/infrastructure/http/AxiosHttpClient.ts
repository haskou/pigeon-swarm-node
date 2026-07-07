import axios, { AxiosInstance } from 'axios';
import https from 'https';

import { HttpClient } from './HttpClient';

export default class AxiosHttpClient implements HttpClient {
  public baseUrl: string;
  public headers: Record<string, string> = {};

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public addHeaders(headers: Record<string, string>): void {
    this.headers = {
      ...this.headers,
      ...headers,
    };
  }

  public client(data?: Record<string, unknown>): AxiosInstance {
    return axios.create({
      baseURL: `${this.baseUrl}`,
      data,
      headers: this.headers,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      responseType: 'json',
    });
  }
}
