import { AxiosInstance } from 'axios';

export interface HttpClient {
  baseUrl: string;
  headers: Record<string, string>;

  client(data?: Record<string, unknown>): AxiosInstance;
  addHeaders(headers: Record<string, string>): void;
}
