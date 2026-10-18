import { InvalidStickerIdError } from '@app/contexts/stickers/domain/errors/InvalidStickerIdError';
import { StickerId } from '@app/contexts/stickers/domain/value-objects/StickerId';
import { StickerPackId } from '@app/contexts/stickers/domain/value-objects/StickerPackId';

const UUID = '3f1c9a2e-7b4d-4e8a-9c21-5d6e7f8a9b0c';
const SHORT_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2';
const REFUSED = [
  '',
  'a'.repeat(37),
  '.',
  'pack:one',
  'pack|one',
  'pack one',
  'café',
];

describe.each([
  ['StickerPackId', StickerPackId],
  ['StickerId', StickerId],
])('%s', (_name, IdClass) => {
  it('accepts UUIDs the UI generates and ShortIds the node generates', () => {
    expect(IdClass.isValid(UUID)).toBe(true);
    expect(IdClass.isValid(SHORT_ID)).toBe(true);
    expect(IdClass.isValid('a'.repeat(36))).toBe(true);
    expect(new IdClass(UUID).valueOf()).toBe(UUID);
  });

  it.each(REFUSED)('refuses %j with an invalid sticker id error', (value) => {
    expect(IdClass.isValid(value)).toBe(false);
    expect(() => new IdClass(value)).toThrow(InvalidStickerIdError);
  });
});
