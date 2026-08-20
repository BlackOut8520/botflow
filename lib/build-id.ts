/**
 * Identifier of the build this code came from.
 *
 * Injected at build time by `next.config.mjs` (see its `env` block), so the value
 * baked into the browser bundle and the value compiled into the server are always
 * from the same deploy. Comparing the bundle's constant against `GET /api/version`
 * therefore tells us exactly one thing: this tab is running an older deploy.
 */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "development"
