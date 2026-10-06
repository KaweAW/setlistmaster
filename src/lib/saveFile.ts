export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands a file to the user. On touch devices that support it, opens the share sheet (on iPhone/iPad:
 * "Save to Files", AirDrop, …): a plain download link is unreliable inside an installed iOS app.
 * Everywhere else it is a normal download.
 */
export async function saveFile(blob: Blob, filename: string): Promise<SaveResult> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return 'cancelled';
        // Sharing can be refused (e.g. the tap was too long ago): fall back to a download.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
