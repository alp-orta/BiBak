import type { PlasmoCSConfig, PlasmoGetShadowHostId } from "plasmo"
import { TrustSidebar } from "~components/TrustSidebar"
import { useEffect, useState } from "react"
import { scrapeCurrentPage, type ScrapedProduct } from "~scrapers"

const SIDEBAR_HOST_ID = "bibak-sidebar-host"
const SIDEBAR_ACTIVE_ATTR = "data-bibak-sidebar-active"
const SIDEBAR_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const SIDEBAR_LOCK_TTL_MS = 3000

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.amazon.com/dp/*",
    "https://*.amazon.com/*/dp/*",
    "https://*.amazon.com/gp/product/*",
    "https://*.amazon.com.tr/dp/*",
    "https://*.amazon.com.tr/*/dp/*",
    "https://*.amazon.com.tr/gp/product/*",
    "https://*.trendyol.com/*-p-*",
    "https://*.hepsiburada.com/*-p-*"
  ]
}

export const getShadowHostId: PlasmoGetShadowHostId = () => SIDEBAR_HOST_ID

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap');
  `
  return style
}

function isSupportedProductPage(url: string): boolean {
  try {
    const current = new URL(url)
    const host = current.hostname.toLowerCase()
    const path = current.pathname

    if (host.includes("trendyol.com")) {
      return /-p-\d+/i.test(path)
    }

    if (host.includes("amazon.")) {
      return /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(path)
    }

    if (host.includes("hepsiburada.com")) {
      return /-p-[A-Z0-9]+/i.test(path)
    }
  } catch {
    return false
  }

  return false
}

function acquireSidebarLock(): boolean {
  const activeInstance = document.documentElement.getAttribute(SIDEBAR_ACTIVE_ATTR)
  const [owner, timestampText] = (activeInstance || "").split(":")
  const timestamp = Number(timestampText)
  const isFreshLock = Number.isFinite(timestamp) && Date.now() - timestamp < SIDEBAR_LOCK_TTL_MS
  if (owner && owner !== SIDEBAR_INSTANCE_ID && isFreshLock) {
    return false
  }

  document.documentElement.setAttribute(SIDEBAR_ACTIVE_ATTR, `${SIDEBAR_INSTANCE_ID}:${Date.now()}`)
  return true
}

function releaseSidebarLock(): void {
  const activeInstance = document.documentElement.getAttribute(SIDEBAR_ACTIVE_ATTR)
  if (activeInstance?.startsWith(`${SIDEBAR_INSTANCE_ID}:`)) {
    document.documentElement.removeAttribute(SIDEBAR_ACTIVE_ATTR)
  }
}

function useCurrentUrl(): string {
  const [currentUrl, setCurrentUrl] = useState(window.location.href)

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextUrl = window.location.href
      setCurrentUrl((previousUrl) => previousUrl === nextUrl ? previousUrl : nextUrl)
    }, 500)

    return () => window.clearInterval(interval)
  }, [])

  return currentUrl
}

const PlasmoOverlay = () => {
  const [scrapedData, setScrapedData] = useState<ScrapedProduct | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(() => isSupportedProductPage(window.location.href))
  const currentUrl = useCurrentUrl()

  useEffect(() => {
    if (!isSupportedProductPage(currentUrl)) {
      releaseSidebarLock()
      setActive(false)
      setScrapedData(null)
      setError(null)
      return
    }

    const hasLock = acquireSidebarLock()
    setActive(hasLock)
    if (!hasLock) {
      return
    }

    let cancelled = false
    setScrapedData(null)
    setError(null)

    scrapeCurrentPage()
      .then((data) => {
        if (!cancelled) setScrapedData(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to scrape page")
      })

    const heartbeat = window.setInterval(() => {
      const activeInstance = document.documentElement.getAttribute(SIDEBAR_ACTIVE_ATTR)
      if (activeInstance?.startsWith(`${SIDEBAR_INSTANCE_ID}:`)) {
        document.documentElement.setAttribute(SIDEBAR_ACTIVE_ATTR, `${SIDEBAR_INSTANCE_ID}:${Date.now()}`)
      }
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(heartbeat)
      releaseSidebarLock()
    }
  }, [currentUrl])

  if (!active) return null

  return (
    <div style={{
      position: "fixed",
      top: 16,
      right: 16,
      zIndex: 2147483647,
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <TrustSidebar scrapedData={scrapedData} scrapeError={error} />
    </div>
  )
}

export default PlasmoOverlay
