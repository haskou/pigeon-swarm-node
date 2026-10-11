import { DomainEvent } from '@haskou/ddd-kernel/domain';

/**
 * Inbound network events that a consumer refused as stale. Handlers return
 * void, so the decision is recorded on the event instance that every handler
 * of one delivery shares, and the gossip adapter skips WebSocket fanout for it.
 */
export const networkFanoutSuppression = new WeakSet<DomainEvent>();
