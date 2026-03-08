import CustomHttpError from '../CustomHttpError';

export default class TokenExpiredError extends CustomHttpError {
  constructor() {
    super(
      401,
      401007,
      "Expired token in HTTP Header 'Authorization: Bearer <token>'",
    );
  }
}
