import { HttpError } from 'routing-controllers';

const UNSUPPORTED_MEDIA_TYPE = 415;

export class UnsupportedMediaTypeError extends HttpError {
  constructor() {
    super(UNSUPPORTED_MEDIA_TYPE, 'Request body must be application/json.');
    this.name = 'UnsupportedMediaTypeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
