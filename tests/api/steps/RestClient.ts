import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
} from 'axios';

export default class RestClient {
  private readonly client: AxiosInstance;
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

  public async getBinary(path: string, headers = {}): Promise<any> {
    try {
      return await this.client.get(path, {
        headers,
        responseType: 'arraybuffer',
      });
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

  public async patch(
    path: string,
    data: string,
    config: AxiosRequestConfig = {},
  ): Promise<any> {
    try {
      return await this.client.patch(path, data, {
        ...config,
        headers: { 'content-type': 'application/json', ...config.headers },
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }

  public async put(path: string, data: any, headers = {}): Promise<any> {
    try {
      return await this.client.put(path, data, headers);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }

  public async delete(
    path: string,
    data?: any,
    config: AxiosRequestConfig = {},
  ): Promise<any> {
    try {
      return await this.client.delete(path, {
        ...config,
        data,
        headers: { 'content-type': 'application/json', ...config.headers },
      });
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        return axiosError.response;
      }

      return (error as Error).message;
    }
  }
}
