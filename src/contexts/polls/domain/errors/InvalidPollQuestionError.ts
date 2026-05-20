import { DomainError } from '@haskou/value-objects';

export class InvalidPollQuestionError extends DomainError {
  constructor() {
    super('Poll question is not valid');
  }
}
