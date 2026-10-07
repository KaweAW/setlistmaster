import { fireEvent, screen } from '@testing-library/react';

/** Picks an option of the custom Select labelled `label`, by its value. */
export async function choose(label: string, value: string) {
  const trigger = await screen.findByLabelText(label, { selector: 'button' });
  fireEvent.click(trigger);
  const option = await screen.findByRole('listbox', { name: label }).then((l) => l.querySelector(`[data-value="${value}"]`));
  if (!option) throw new Error(`No option "${value}" in "${label}"`);
  fireEvent.click(option);
}

/** The text a Select currently shows. */
export async function shown(label: string) {
  return (await screen.findByLabelText(label, { selector: 'button' })).textContent;
}
