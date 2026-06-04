import { PubSubMessage } from './PubSubMessage';

export type PubSubEvent = CustomEvent<PubSubMessage>;
