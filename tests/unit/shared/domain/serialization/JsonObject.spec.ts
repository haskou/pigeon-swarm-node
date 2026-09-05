import { JsonObject } from '@app/shared/domain/serialization/JsonObject';

describe('JsonObject', () => {
  it('preserves nested JSON content at serialization boundaries', () => {
    const content = {
      enabled: true,
      values: [1, null, { nested: 'value' }],
    };

    expect(JsonObject.fromPrimitives(content).toPrimitives()).toEqual(content);
  });

  it('isolates stored content from later input and output mutations', () => {
    const input = { value: 'original' };
    const content = JsonObject.fromPrimitives(input);
    input.value = 'changed';
    content.toPrimitives().value = 'changed again';

    expect(content.toPrimitives()).toEqual({ value: 'original' });
  });

  it.each([null, undefined, [], 'text', 1])(
    'rejects non-object input %s',
    (value) => {
      expect(() => JsonObject.fromPrimitives(value)).toThrow();
    },
  );

  it('rejects data that cannot be serialized without exposing its content', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => JsonObject.fromPrimitives(circular)).toThrow('JSON object');
    expect(() => JsonObject.fromPrimitives({ value: BigInt(1) })).toThrow(
      'JSON object',
    );
  });
});
