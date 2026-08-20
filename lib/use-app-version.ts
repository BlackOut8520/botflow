"use client"

import { useEffect, useState } from "react"
import { BUILD_ID } from "./build-id"

/**
 * Watches for a new deploy while the tab stays open.
 *
 * Long-lived tabs keep running the JavaScript bundle they downloaded, so a tab opened
 * before a deploy can go on editing with the old client code indefinitely. Polling
 * `/api/version` and comparing against the bundle's own build id lets the UI tell the
 * user to reload instead of letting the two versions fight over the same rows.
 *
 * Returns true once a different build is live. Never flips back.
 */
export function useAppVersion(intervalMs = 60_000): boolean {
  const [outdated, setOutdated] = useState(false)

  useEffect(() => {
    // Nothing to compare against in local dev, and HMR already handles it.
    if (outdated || BUILD_ID === "development") return

    let cancelled = false

    const check = async () => {
      if (cancelled || document.visibilityState === "hidden") return
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const data: unknown = await res.json()
        const buildId = (data as { buildId?: unknown } | null)?.buildId
        if (!cancelled && typeof buildId === "string" && buildId !== BUILD_ID) setOutdated(true)
      } catch {
        // Offline or a transient failure: just try again on the next tick.
      }
    }

    const timer = setInterval(check, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", onVisible)
    void check()

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [intervalMs, outdated])

  return outdated
}
