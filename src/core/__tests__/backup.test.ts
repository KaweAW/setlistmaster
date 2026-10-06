import { describe, expect, it } from 'vitest';
import {
  backupReminderDue, base64ToBytes, bytesToBase64, createBackup, daysSince, parseBackup, summarizeSnapshot,
} from '../backup';
import type { StoreSnapshot } from '../types';

const base = { bandId: 'b1', createdAt: 1, updatedAt: 1 };
const snapshot = (): StoreSnapshot => ({
  bands: [{ id: 'b1', createdAt: 1, updatedAt: 1, name: 'My band' }],
  members: [],
  performers: [{ ...base, id: 'p1', name: 'Julie', color: '#C4245C', symbol: '♀' }],
  tunings: [{ ...base, id: 't1', name: 'Standard', notes: 'E A D G B E', isStandard: true }],
  attachments: [],
  instruments: [{ ...base, id: 'n1', name: 'Bass', order: 2 }],
  parts: [{ ...base, id: 'r1', songId: 's1', instrumentId: 'n1', chordpro: '[Am]walk', notes: '' }],
  songs: [{
    ...base, id: 's1', title: 'Спокойная ночь', artist: 'Кино', capo: 0, tuningId: 't1', defaultPerformerIds: ['p1'], instrumentIds: ['n1'],
    chordpro: '[Am]Спокойная [G]ночь', pdfBlobId: 'f1', notes: '', tags: ['rock'], durationSec: 230,
  }],
  setlists: [{ ...base, id: 'l1', title: 'Live', date: '2026-10-03', venue: 'Club', notes: '', archived: false }],
  blocks: [{ ...base, id: 'k1', setlistId: 'l1', name: 'Blocco 1', subtitle: '', reserve: false, position: 'a0' }],
  items: [{
    ...base, id: 'i1', setlistId: 'l1', blockId: 'k1', songId: 's1', position: 'a0', performerIds: [],
    performerNote: 'io o lei', transitionType: 'segue', transitionText: 'Fine → **Next**', notes: '',
  }],
  files: [{ id: 'f1', bandId: 'b1', name: 'chart.pdf', mimeType: 'application/pdf', size: 5, createdAt: 1, data: new Uint8Array([37, 80, 68, 70, 255]).buffer }],
});

describe('base64', () => {
  it('round-trips any bytes, including big buffers', () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    expect(new Uint8Array(base64ToBytes(bytesToBase64(big.buffer)))).toEqual(big);
    expect(bytesToBase64(new Uint8Array([72, 105]).buffer)).toBe('SGk=');
  });
});

describe('backup file', () => {
  it('round-trips everything, PDFs and Cyrillic included', () => {
    const original = snapshot();
    const text = JSON.stringify(createBackup(original, 1_700_000_000_000));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.exportedAt).toBe(1_700_000_000_000);
    expect(parsed.snapshot.songs).toEqual(original.songs);
    expect(parsed.snapshot.items).toEqual(original.items);
    expect(parsed.snapshot.setlists).toEqual(original.setlists);
    expect(parsed.snapshot.performers).toEqual(original.performers);
    expect(parsed.snapshot.files[0]!.name).toBe('chart.pdf');
    expect(new Uint8Array(parsed.snapshot.files[0]!.data)).toEqual(new Uint8Array([37, 80, 68, 70, 255]));
    expect(parsed.summary).toEqual({ songs: 1, setlists: 1, performers: 1, tunings: 1, files: 1 });
    expect(summarizeSnapshot(parsed.snapshot)).toEqual(parsed.summary);
  });

  it('refuses anything that is not a valid backup, without throwing', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'not-json' });
    expect(parseBackup('{"hello":1}')).toEqual({ ok: false, error: 'wrong-format' });
    expect(parseBackup('null')).toEqual({ ok: false, error: 'wrong-format' });
    expect(parseBackup('[1,2]')).toEqual({ ok: false, error: 'wrong-format' });
  });

  it('refuses a backup made by a newer version of the app', () => {
    const file = { ...createBackup(snapshot(), 1), version: 99 };
    expect(parseBackup(JSON.stringify(file))).toEqual({ ok: false, error: 'newer-version' });
  });

  it('refuses damaged data: bad records, no band, a PDF that is not base64', () => {
    const good = createBackup(snapshot(), 1);
    const badSong = JSON.parse(JSON.stringify(good));
    badSong.data.songs[0].title = '';
    expect(parseBackup(JSON.stringify(badSong))).toEqual({ ok: false, error: 'invalid-data' });

    const noBand = JSON.parse(JSON.stringify(good));
    noBand.data.bands = [];
    expect(parseBackup(JSON.stringify(noBand))).toEqual({ ok: false, error: 'invalid-data' });

    const badPdf = JSON.parse(JSON.stringify(good));
    badPdf.data.files[0].dataBase64 = '%%% not base64 %%%';
    expect(parseBackup(JSON.stringify(badPdf))).toEqual({ ok: false, error: 'invalid-data' });

    const missing = JSON.parse(JSON.stringify(good));
    delete missing.data;
    expect(parseBackup(JSON.stringify(missing))).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('fills defaults for optional sections', () => {
    const minimal = { format: 'scaletta-backup', version: 1, exportedAt: 5, data: { bands: [{ id: 'b', createdAt: 1, updatedAt: 1, name: 'B' }] } };
    const parsed = parseBackup(JSON.stringify(minimal));
    expect(parsed.ok && parsed.summary).toEqual({ songs: 0, setlists: 0, performers: 0, tunings: 0, files: 0 });
  });
});

describe('backup reminder', () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;
  it('is not due right after a backup or on a fresh install', () => {
    expect(backupReminderDue({ now, lastBackupAt: now - 3 * DAY, firstSeenAt: 0, snoozedUntil: null })).toBe(false);
    expect(backupReminderDue({ now, lastBackupAt: null, firstSeenAt: now - 2 * DAY, snoozedUntil: null })).toBe(false);
  });
  it('is due after 14 days, counted from the last backup or else from first use', () => {
    expect(backupReminderDue({ now, lastBackupAt: now - 14 * DAY, firstSeenAt: 0, snoozedUntil: null })).toBe(true);
    expect(backupReminderDue({ now, lastBackupAt: null, firstSeenAt: now - 20 * DAY, snoozedUntil: null })).toBe(true);
  });
  it('stays quiet while snoozed, and when there is nothing to count from', () => {
    expect(backupReminderDue({ now, lastBackupAt: null, firstSeenAt: 0, snoozedUntil: now + DAY })).toBe(false);
    expect(backupReminderDue({ now, lastBackupAt: null, firstSeenAt: 0, snoozedUntil: now - 1 })).toBe(true);
    expect(backupReminderDue({ now, lastBackupAt: null, firstSeenAt: null, snoozedUntil: null })).toBe(false);
  });
  it('counts whole days', () => {
    expect(daysSince(now - 3.9 * DAY, now)).toBe(3);
    expect(daysSince(null, now)).toBeNull();
  });
});
