import { CallSignalRateBucket } from './CallSignalRateBucket';

export type CallSignalRateLimitDocument = CallSignalRateBucket & {
  _id: string;
};
