import DomainEvent from '@app/shared/domain/events/DomainEvent';

export type DomainEventHandler = (event: DomainEvent) => Promise<void>;
