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
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  `
  return style
}

const PlasmoOverlay = () => {
  const [scrapedData, setScrapedData] = useState<ScrapedProduct | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    scrapeCurrentPage()
      .then(data => setScrapedData(data))
      .catch(err => setError(err.message || "Failed to scrape page"))
  }, [])

  return (
    <div style={{
      position: "fixed",
      top: 16,
      right: 16,
      zIndex: 2147483647,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <TrustSidebar scrapedData={scrapedData} scrapeError={error} />
    </div>
  )
}

export default PlasmoOverlay
