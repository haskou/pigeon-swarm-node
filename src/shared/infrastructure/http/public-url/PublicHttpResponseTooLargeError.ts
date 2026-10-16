import { PublicHttpFetchError } from './PublicHttpFetchError';

/** The response body grew past the caller's byte limit; reading stopped there. */
export class PublicHttpResponseTooLargeError extends PublicHttpFetchError {
  constructor() {
    super('Response is too large.');
  }
}
