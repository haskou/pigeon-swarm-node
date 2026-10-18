import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';

describe('PageLimit', () => {
  it.each([
    [undefined, 50],
    ['', 50],
    ['abc', 50],
    ['10', 10],
    [25, 25],
    ['0', 1],
    ['-4', 1],
    ['101', 100],
    ['999999', 100],
    ['7.9', 7],
  ])('reads %p as %p', (value, expected) => {
    expect(PageLimit.parse(value)).toEqual(expected);
  });
});
