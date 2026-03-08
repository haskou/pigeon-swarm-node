export default class NoFailedMessagesError extends Error {
  constructor(queueName: string) {
    super(`No failed messages on dlx queue ${queueName}.`);
  }
}
