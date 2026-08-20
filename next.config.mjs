/**
 * The build id is injected into both the client bundle and the server so that a tab
 * running an old deploy can detect it (see lib/use-app-version.ts). Vercel exposes a
 * per-deploy id at build time; anything else falls back to the commit sha, and local
 * development uses a constant so the check stays off.
 */
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "development"

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
