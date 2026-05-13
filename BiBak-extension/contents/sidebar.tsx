import type { PlasmoCSConfig, PlasmoGetShadowHostId } from "plasmo"
import { TrustSidebar } from "~components/TrustSidebar"
import { useEffect, useState } from "react"
import { analyzeProduct } from "~api/client"

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
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const extractAndAnalyze = () => {
      const title = document.title || "Unknown Product"

      analyzeProduct({
        title,
        price: "$99.99",
        seller: "Mock Seller",
        reviews: ["Great product!", "Horrible, fake!"],
        rating: 4.5
      }).then(res => {
        setData(res)
        setLoading(false)
      }).catch(err => {
        console.error("BiBak API Error", err)
        setLoading(false)
      })
    }

    // Small delay to let the page settle
    setTimeout(extractAndAnalyze, 800)
  }, [])

  return (
    <div style={{
      position: "fixed",
      top: 16,
      right: 16,
      zIndex: 2147483647,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <TrustSidebar data={data} loading={loading} />
    </div>
  )
}

export default PlasmoOverlay
