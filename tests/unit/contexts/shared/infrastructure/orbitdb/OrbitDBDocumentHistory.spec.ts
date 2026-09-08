import { OrbitDBDocumentHistory } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDocumentHistory';
import { OrbitDBEntry } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBEntry';

it('replays successful iterations again if a later iteration in the same drain fails', async () => {
  const first: OrbitDBEntry = { hash: 'first', next: [], payload: { value: { id: 'first' } } };
  const missing: OrbitDBEntry = { hash: 'missing', next: [], payload: { value: { id: 'missing' } } };
  const second: OrbitDBEntry = { hash: 'second', next: ['first', 'missing'], payload: { value: { id: 'second' } } };
  let heads = [first];
  let available = false;
  let requestedRefresh = false;
  const seen: unknown[] = [];
  const history = new OrbitDBDocumentHistory({
    heads: async () => heads,
    get: async (hash) => hash === 'first' ? first : available ? missing : undefined,
  }, (value) => {
    seen.push(value);
    if (!requestedRefresh) {
      requestedRefresh = true;
      heads = [second];
      void history.refresh();
    }
  });

  await expect(history.refresh()).rejects.toThrow('OrbitDB document history is incomplete');
  available = true;
  await history.refresh();
  expect(seen.filter((value) => (value as { id: string }).id === 'first')).toHaveLength(2);
});
