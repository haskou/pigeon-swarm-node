import CustomHttpError from '../CustomHttpError';

export default class UnpaidDomainError extends CustomHttpError {
  constructor() {
    super(401, 401019, 'Unpaid domain');
  }
}
