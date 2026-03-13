import { AxiosInstance } from 'axios';

import { HttpConfig } from './AxiosHttpClient';

abstract class HttpClient {
  public headers: Record<string, string> = {};
  public baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public abstract client(data?: HttpConfig): AxiosInstance;
  public abstract addHeaders(headers: Record<string, string>): void;
}

export default HttpClient;
