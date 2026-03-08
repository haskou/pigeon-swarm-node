import CustomHttpError from '../CustomHttpError';

export default class InvalidRequestOnUserLogError extends CustomHttpError {
  constructor() {
    super(401, null, 'Invalid request on user log');
  }
}
