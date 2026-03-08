import CustomHttpError from '../CustomHttpError';

export default class InvalidAuthorizationHeaderError extends CustomHttpError {
  constructor() {
    super(401, 401005, "Invalid HTTP Header 'Authorization: Bearer <token>'");
  }
}
