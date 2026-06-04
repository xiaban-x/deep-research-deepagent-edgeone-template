/**
 * Lightweight logger for cloud-functions.
 *
 * Cloud-functions sit on a different runtime entry point than agents/, so we
 * don't import from agents/_shared.ts (which pulls in the OpenAI Agents SDK
 * and other AI deps). Format mirrors agents/_shared.ts createLogger so logs
 * across the two runtimes look the same.
 */
export function createLogger(name: string) {
  return {
    log(...args: unknown[]) {
      console.log(`[${name}][${new Date().toISOString()}]`, ...args);
    },
    error(...args: unknown[]) {
      console.error(`[${name}][${new Date().toISOString()}]`, ...args);
    },
  };
}
