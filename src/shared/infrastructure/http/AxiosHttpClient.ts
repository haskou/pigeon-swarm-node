import axios, { AxiosInstance } from 'axios';
import HttpClient from './HttpClient';
import https from 'https';

export type HttpConfig = Record<string, unknown>;

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

  public client(data?: HttpConfig): AxiosInstance {
    return axios.create({
      baseURL: `${this.baseUrl}`,
      data,
      headers: this.headers,
      responseType: 'json',
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });
  }
}
