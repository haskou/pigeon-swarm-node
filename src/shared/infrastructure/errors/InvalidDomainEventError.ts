export default class InvalidDomainEventError extends Error {
  constructor(body: string) {
    super(`Invalid domain event with body ${body}`);
  }
}
