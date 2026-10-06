/** Client-side UUID generation. `crypto.randomUUID` exists in browsers, Node and React Native (polyfilled). */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
