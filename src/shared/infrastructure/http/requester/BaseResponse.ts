export interface BaseResponse<R> {
  data: R;
  status: number;
  statusText: string;
}
