import { SHA256Hash } from '@haskou/value-objects';

/** SHA-256 of a registration code, hex: the only form the node stores. */
export class NodeRegistrationCodeHash extends SHA256Hash {}
