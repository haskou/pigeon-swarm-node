import axios, { Axios, AxiosError } from 'axios';

export default class RestClient {
  private readonly client: Axios;
  public bearerToken: string = null;

  constructor() {
    const port = process.env.API_PORT || 8081;
    const baseURL = `http://localhost:${port}`;
    this.client = axios.create({ baseURL });
    this.client.interceptors.request.use((req) => {
      if (this.bearerToken) {
        req.headers.Authorization = `Bearer ${this.bearerToken}`;
      }

      return req;
    });
  }

  public async get(path: string, headers = {}): Promise<any> {
    try {
      return await this.client.get(path, { headers });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }

  public async post(path: string, data: any, headers = {}): Promise<any> {
    try {
      return await this.client.post(path, data, headers);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }

  public async patch(path: string, data: string): Promise<any> {
    try {
      return await this.client.patch(path, data, {
        headers: { 'content-type': 'application/json' },
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }

  public async put(path: string, data: string): Promise<any> {
    try {
      return await this.client.put(path, JSON.parse(data));
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }

  public async delete(path: string): Promise<any> {
    try {
      return await this.client.delete(path);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }
}
