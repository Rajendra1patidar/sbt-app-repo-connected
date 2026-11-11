import { api } from "./api";

/**
 * Waits for a sleeping server to answer. The free Render plan puts the backend to
 * sleep after about 15 quiet minutes and needs up to a minute to wake on the next
 * request, so after a failed load we check its health address every few seconds
 * instead of showing an error. Resolves true as soon as it answers, or false if it
 * still has not after `maxMs`. `ping` can be replaced in tests.
 */
export async function waitForServer(
  maxMs = 120000,
  everyMs = 3000,
  ping: () => Promise<boolean> = () => api.ping()
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, everyMs));
  }
  return false;
}
