import { expect, test } from '@playwright/test';

// Each test gets a fresh browser profile, so the app starts from its example data (a setlist called "Example setlist").

test('opens the example setlist and goes in and out of stage mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Example setlist/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Example setlist' })).toBeVisible();

  await page.getByRole('button', { name: 'Stage mode' }).first().click();
  const exit = page.getByRole('button', { name: 'Exit stage mode' });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect(exit).toBeHidden();
});

test('a new setlist with a song in it survives a reload (nothing needs a network)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New setlist' }).click();

  // New setlists open in edit mode, with an empty first block.
  await page.getByLabel('Title', { exact: true }).fill('Friday night');
  await page.getByRole('button', { name: '+ Add song' }).first().click();
  const picker = page.getByRole('dialog');
  await picker.getByRole('switch', { name: /Zombie/ }).click();
  await expect(picker.getByRole('switch', { name: /Zombie/ })).toHaveAttribute('aria-checked', 'true');
  await picker.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Friday night' })).toBeVisible();
  await expect(page.getByText('Zombie').first()).toBeVisible();
});

test('the library finds a song by title and opens its page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Library' }).last().click();
  await page.getByLabel('Search title or artist').fill('zombie');
  const row = page.locator('.song-row', { hasText: /Zombie/ });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByRole('heading', { name: /Zombie/ })).toBeVisible();
});

test('a song pasted with chords above the words and fingerings is saved and shows its chord diagrams', async ({ page }) => {
  await page.goto('/library/new');
  await page.getByLabel('Title', { exact: true }).fill('Patient Song');
  await page.getByRole('button', { name: /Charts/ }).click();
  await page.getByLabel(/Lyrics and chords/).fill(['F#m    244222', '', '[Verse 1]', 'F#m       C#', '   I am a patient one'].join('\n'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.locator('.song-row', { hasText: 'Patient Song' }).click();
  const strip = page.getByRole('list', { name: 'Chord diagrams' });
  await expect(strip.getByTitle('F#m 244222')).toBeVisible();
  await expect(strip.getByTitle('C# x46664')).toBeVisible(); // not written in the text: a ready-made barre shape
});
