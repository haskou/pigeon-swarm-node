import CustomHttpError from '../CustomHttpError';

export default class MissingAuthorizationHeaderError extends CustomHttpError {
  constructor() {
    super(401, 401004, "Missing HTTP Header 'Authorization: Bearer <token>'");
  }
}
