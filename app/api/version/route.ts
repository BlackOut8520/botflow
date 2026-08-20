import { BUILD_ID } from "@/lib/build-id"

// Must never be cached or prerendered: it is the freshness probe itself.
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Reports the build id of the deployment serving this request.
 *
 * Deliberately a plain route handler and not a Server Action: action ids are scoped to
 * a build, so a stale tab calling one after a new deploy can fail outright. A GET on a
 * stable URL keeps working across deploys, which is precisely when we need the answer.
 */
export async function GET() {
  return new Response(JSON.stringify({ buildId: BUILD_ID }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}
