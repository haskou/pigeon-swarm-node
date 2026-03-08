import CustomHttpError from '../CustomHttpError';

export default class InvalidTokenError extends CustomHttpError {
  constructor() {
    super(
      401,
      401006,
      "Invalid token in HTTP Header 'Authorization: Bearer <token>'",
    );
  }
}
