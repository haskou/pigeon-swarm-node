import { RestResponseData } from './RestResponseData';

export interface RestResponse {
  data: RestResponseData;
  headers: Record<string, string>;
  status: number;
  statusText: string;
}
