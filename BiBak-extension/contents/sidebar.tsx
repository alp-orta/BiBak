import type { PlasmoCSConfig, PlasmoGetShadowHostId } from "plasmo"
import { TrustSidebar } from "~components/TrustSidebar"
import { useEffect, useState } from "react"
import { scrapeCurrentPage, type ScrapedProduct } from "~scrapers"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.amazon.com/*",
    "https://*.amazon.com.tr/*",
    "https://*.trendyol.com/*",
    "https://*.hepsiburada.com/*"
  ]
}

export const getShadowHostId: PlasmoGetShadowHostId = () => "bibak-sidebar-host"

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap');
  `
  return style
}

function isSupportedProductPage(url: string): boolean {
  if (url.includes("trendyol.com")) {
    return /-p-\d+/i.test(url)
  }

  if (url.includes("amazon.com") || url.includes("amazon.com.tr")) {
    return /\/(?:dp|gp\/product)\//i.test(url)
  }

  if (url.includes("hepsiburada.com")) {
    return /-p-[A-Za-z0-9]+/i.test(url)
  }

  return false
}

const PlasmoOverlay = () => {
  const [scrapedData, setScrapedData] = useState<ScrapedProduct | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shouldShow = isSupportedProductPage(window.location.href)

  useEffect(() => {
    if (!shouldShow) {
      return
    }

    scrapeCurrentPage()
      .then(data => setScrapedData(data))
      .catch(err => setError(err.message || "Failed to scrape page"))
  }, [shouldShow])

  if (!shouldShow) {
    return null
  }

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
