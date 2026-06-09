import { Message } from '@app/shared/infrastructure/messageBus/Message';

export type ReplicatedDomainEventMessage = Message & {
  replication: {
    networkId: string;
    originPeerId: string;
  };
};
