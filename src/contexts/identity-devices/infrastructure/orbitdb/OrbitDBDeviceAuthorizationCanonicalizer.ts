import { compareCodeUnits } from '@app/contexts/shared/domain/compareCodeUnits';

export default class OrbitDBDeviceAuthorizationCanonicalizer {
  public normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalize(item));
    }

    if (typeof value !== 'object' || value === null) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, item]) => [key, this.normalize(item)]),
    );
  }

  public serialize(value: unknown): string {
    return JSON.stringify(this.normalize(value));
  }
}
