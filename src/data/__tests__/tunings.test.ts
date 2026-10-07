import { describe, expect, it } from 'vitest';
import { bootstrap } from '../bootstrap';
import { createDexieStore } from '../dexie/dexieRepository';
import { normalizeTunings, tuningIdFor } from '../tunings';

let n = 0;
let clock = 1_000;
const fresh = () => createDexieStore({ dbName: `tun-${++n}`, now: () => ++clock });

describe('tuning format', () => {
  it('writes every tuning one way, merges duplicates and drops overrides equal to the song', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    const standard = (await store.tunings.listBy('bandId', band.id)).find((t) => t.isStandard)!;
    // "standard" typed by hand as a custom tuning, and the same tuning typed two ways
    const fakeStandard = await store.tunings.create({ bandId: band.id, name: 'EADGBE', notes: 'EADGBE', isStandard: false });
    const a = await store.tunings.create({ bandId: band.id, name: 'whole step', notes: 'D-G-C-F-A-D', isStandard: false });
    const b = await store.tunings.create({ bandId: band.id, name: 'D G C F A D', notes: 'DGCFAD', isStandard: false });
    const free = await store.tunings.create({ bandId: band.id, name: 'Open G slide', notes: '', isStandard: false });
    const [song, other] = (await store.songs.listBy('bandId', band.id));
    await store.songs.update(song!.id, { tuningId: fakeStandard.id });
    await store.songs.update(other!.id, { tuningId: free.id });
    const item = (await store.items.listBy('songId', song!.id))[0]!;
    await store.items.update(item.id, { tuningOverrideId: standard.id }); // same as the song once merged

    await normalizeTunings(store, band.id);

    const after = await store.tunings.listBy('bandId', band.id);
    expect(after.find((t) => t.id === fakeStandard.id)).toBeUndefined();
    expect(after.find((t) => t.id === b.id)).toBeUndefined();
    expect(after.find((t) => t.id === a.id)).toBeUndefined(); // the seeded D G C F A D stays
    expect(after.filter((t) => t.notes === 'D G C F A D')).toHaveLength(1);
    expect(after.find((t) => t.notes === 'D G C F A D')?.name).toBe('Whole step down');
    expect(after.find((t) => t.id === free.id)?.name).toBe('Open G slide');
    expect((await store.songs.get(song!.id))!.tuningId).toBe(standard.id);
    expect((await store.songs.get(other!.id))!.tuningId).toBe(free.id);
    expect((await store.items.get(item.id))!.tuningOverrideId).toBeUndefined();
    // running again changes nothing
    await normalizeTunings(store, band.id);
    expect(await store.tunings.listBy('bandId', band.id)).toHaveLength(after.length);
  });

  it('finds or creates the tuning for a set of strings', async () => {
    const store = fresh();
    const band = await bootstrap(store);
    const std = (await store.tunings.listBy('bandId', band.id)).find((t) => t.isStandard)!;
    expect(await tuningIdFor(store, band.id, ['E', 'A', 'D', 'G', 'B', 'E'])).toBe(std.id);
    const made = await tuningIdFor(store, band.id, ['D', 'A', 'D', 'G', 'B', 'E']);
    expect(await tuningIdFor(store, band.id, ['D', 'A', 'D', 'G', 'B', 'E'])).toBe(made);
  });
});
