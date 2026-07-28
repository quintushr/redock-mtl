/**
 * Lets Node resolve the extensionless relative imports TypeScript uses.
 *
 * Node strips types from `.ts` files on its own, but it still resolves
 * specifiers the way ESM does, so `./resolve` does not find `./resolve.ts`.
 * This retries a failed relative resolution with the extensions the project
 * actually uses.
 *
 * Fifteen lines instead of a build-tool dependency, for one script that runs
 * outside the bundler.
 */

const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".")) throw error;

    for (const extension of EXTENSIONS) {
      try {
        return await nextResolve(specifier + extension, context);
      } catch {
        // Try the next one; the original error is thrown if none works.
      }
    }

    throw error;
  }
}
