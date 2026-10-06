/** Reloads the app (after a restore or a wipe, so every screen starts from the new data). A function so tests can replace it. */
export const reloadApp = (): void => window.location.reload();
