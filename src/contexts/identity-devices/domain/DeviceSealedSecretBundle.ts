import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature } from '@haskou/pigeon-swarm-crypto';
import { UniqueObjectArray } from '@haskou/value-objects';

import { DeviceAuthorization } from './DeviceAuthorization';
import { DeviceSealedSecretGenerationStaleError } from './errors/DeviceSealedSecretGenerationStaleError';
import { DeviceSealedSecretNotFoundError } from './errors/DeviceSealedSecretNotFoundError';
import { DeviceSealedSecretPublisherNotAuthorizedError } from './errors/DeviceSealedSecretPublisherNotAuthorizedError';
import { DeviceSealedSecretRecipientsMismatchError } from './errors/DeviceSealedSecretRecipientsMismatchError';
import { DeviceSealedSecretRevisionMismatchError } from './errors/DeviceSealedSecretRevisionMismatchError';
import { InvalidDeviceSealedSecretBundleError } from './errors/InvalidDeviceSealedSecretBundleError';
import { InvalidDeviceSealedSecretSignatureError } from './errors/InvalidDeviceSealedSecretSignatureError';
import { DeviceAuthorizationRevision } from './value-objects/DeviceAuthorizationRevision';
import { DeviceSealedSecretGeneration } from './value-objects/DeviceSealedSecretGeneration';

export interface DeviceSealedSecretEntryPrimitives {
  recipientCredential: string;
  sealedSecret: string;
  signature: string;
}

export interface DeviceSealedSecretBundlePrimitives {
  identityId: string;
  publisherCredential: string;
  authorizationRevision: number;
  generation: number;
  entries: DeviceSealedSecretEntryPrimitives[];
}

export interface DeviceSealedSecretDeliveryPrimitives extends DeviceSealedSecretEntryPrimitives {
  identityId: string;
  publisherCredential: string;
  authorizationRevision: number;
  generation: number;
}

export interface DeviceSealedSecretSigningInput {
  authorizationRevision: number;
  generation: number;
  identityId: string;
  publisherCredential: string;
  recipientCredential: string;
  sealedSecret: string;
}

interface DeviceSealedSecretEntry {
  recipientCredential: DeviceCredential;
  sealedSecret: string;
  signature: string;
}

const SIGNING_PURPOSE = 'pigeon:device-sealed-secret:v1';
const MAX_ENTRIES = 128;
const SEALED_SECRET_PATTERN = /^[A-Za-z0-9+/=.-]+$/;

function parseOrReject<T>(reason: string, parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new InvalidDeviceSealedSecretBundleError(reason);
  }
}

/** Wire form of a credential: the identity-id body without PEM headers. */
function toWire(credential: DeviceCredential): string {
  return new IdentityId(credential.valueOf()).valueOf();
}

export class DeviceSealedSecretBundle {
  public static readonly MAX_SEALED_SECRET_LENGTH = 4096;

  public static fromPrimitives(
    primitives: DeviceSealedSecretBundlePrimitives,
  ): DeviceSealedSecretBundle {
    const generation = parseOrReject(
      'generation must be a positive integer',
      () => new DeviceSealedSecretGeneration(primitives.generation),
    );
    const authorizationRevision = parseOrReject(
      'authorization revision must be a non-negative integer',
      () => new DeviceAuthorizationRevision(primitives.authorizationRevision),
    );

    if (
      primitives.entries.length < 1 ||
      primitives.entries.length > MAX_ENTRIES
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        `entries must hold between 1 and ${MAX_ENTRIES} recipients`,
      );
    }

    const entries = primitives.entries.map((entry) => {
      const recipientCredential = parseOrReject(
        'recipient credential is malformed',
        () =>
          DeviceCredential.fromIdentityId(
            new IdentityId(entry.recipientCredential),
          ),
      );

      if (
        entry.sealedSecret.length < 1 ||
        entry.sealedSecret.length >
          DeviceSealedSecretBundle.MAX_SEALED_SECRET_LENGTH ||
        !SEALED_SECRET_PATTERN.test(entry.sealedSecret)
      ) {
        throw new InvalidDeviceSealedSecretBundleError(
          'sealed secret is malformed',
        );
      }

      if (entry.signature.length === 0) {
        throw new InvalidDeviceSealedSecretBundleError(
          'signature must not be empty',
        );
      }

      return {
        recipientCredential,
        sealedSecret: entry.sealedSecret,
        signature: entry.signature,
      };
    });

    if (
      UniqueObjectArray.fromArray(
        entries.map((entry) => entry.recipientCredential),
      ).length !== entries.length
    ) {
      throw new InvalidDeviceSealedSecretBundleError(
        'recipient credentials must be unique',
      );
    }

    return new DeviceSealedSecretBundle(
      parseOrReject(
        'identity id is malformed',
        () => new IdentityId(primitives.identityId),
      ),
      parseOrReject('publisher credential is malformed', () =>
        DeviceCredential.fromIdentityId(
          new IdentityId(primitives.publisherCredential),
        ),
      ),
      authorizationRevision,
      generation,
      entries,
    );
  }

  public static signingPayload(input: DeviceSealedSecretSigningInput): string {
    return JSON.stringify({
      authorizationRevision: input.authorizationRevision,
      generation: input.generation,
      identityId: input.identityId,
      publisherCredential: input.publisherCredential,
      purpose: SIGNING_PURPOSE,
      recipientCredential: input.recipientCredential,
      sealedSecret: input.sealedSecret,
    });
  }

  private constructor(
    private readonly identityId: IdentityId,
    private readonly publisherCredential: DeviceCredential,
    private readonly authorizationRevision: DeviceAuthorizationRevision,
    private readonly generation: DeviceSealedSecretGeneration,
    private readonly entries: readonly DeviceSealedSecretEntry[],
  ) {}

  private hasValidSignature(entry: DeviceSealedSecretEntry): boolean {
    try {
      return this.publisherCredential.isValidSignature(
        DeviceSealedSecretBundle.signingPayload({
          authorizationRevision: this.authorizationRevision.valueOf(),
          generation: this.generation.valueOf(),
          identityId: this.identityId.valueOf(),
          publisherCredential: toWire(this.publisherCredential),
          recipientCredential: toWire(entry.recipientCredential),
          sealedSecret: entry.sealedSecret,
        }),
        new Signature(entry.signature),
      );
    } catch {
      return false;
    }
  }

  public assertPublishableBy(authorization: DeviceAuthorization): void {
    if (!this.identityId.isEqual(authorization.getIdentityId())) {
      throw new InvalidDeviceSealedSecretBundleError(
        'bundle is addressed to another identity',
      );
    }

    if (!authorization.getRevision().isEqual(this.authorizationRevision)) {
      throw new DeviceSealedSecretRevisionMismatchError();
    }

    if (!authorization.isAuthorized(this.publisherCredential)) {
      throw new DeviceSealedSecretPublisherNotAuthorizedError();
    }

    const authorized = UniqueObjectArray.fromArray(
      authorization.getCredentials(),
    );
    const recipients = this.entries.map((entry) => entry.recipientCredential);

    if (
      authorized.length !== recipients.length ||
      recipients.some((recipient) => !authorized.includes(recipient))
    ) {
      throw new DeviceSealedSecretRecipientsMismatchError();
    }

    for (const entry of this.entries) {
      if (!this.hasValidSignature(entry)) {
        throw new InvalidDeviceSealedSecretSignatureError();
      }
    }
  }

  public assertSupersedes(stored: DeviceSealedSecretBundle | undefined): void {
    if (stored && stored.generation.isGreaterOrEqualThan(this.generation)) {
      throw new DeviceSealedSecretGenerationStaleError();
    }
  }

  public deliveryFor(
    recipientCredential: DeviceCredential,
  ): DeviceSealedSecretDeliveryPrimitives {
    const entry = this.entries.find((candidate) =>
      candidate.recipientCredential.isEqual(recipientCredential),
    );

    if (!entry) {
      throw new DeviceSealedSecretNotFoundError();
    }

    return {
      authorizationRevision: this.authorizationRevision.valueOf(),
      generation: this.generation.valueOf(),
      identityId: this.identityId.valueOf(),
      publisherCredential: toWire(this.publisherCredential),
      recipientCredential: toWire(entry.recipientCredential),
      sealedSecret: entry.sealedSecret,
      signature: entry.signature,
    };
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getGeneration(): DeviceSealedSecretGeneration {
    return this.generation;
  }

  public getAuthorizationRevision(): DeviceAuthorizationRevision {
    return this.authorizationRevision;
  }

  public toPrimitives(): DeviceSealedSecretBundlePrimitives {
    return {
      authorizationRevision: this.authorizationRevision.valueOf(),
      entries: this.entries.map((entry) => ({
        recipientCredential: toWire(entry.recipientCredential),
        sealedSecret: entry.sealedSecret,
        signature: entry.signature,
      })),
      generation: this.generation.valueOf(),
      identityId: this.identityId.valueOf(),
      publisherCredential: toWire(this.publisherCredential),
    };
  }
}
