import cssText from "data-text:~style.css"
import type { PlasmoCSConfig, PlasmoGetInlineStyle } from "plasmo"
import { TrustSidebar } from "~components/TrustSidebar"
import { useEffect, useState } from "react"
import { analyzeProduct } from "~api/client"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.amazon.com/*",
    "https://*.trendyol.com/*",
    "https://*.hepsiburada.com/*"
  ]
}

export const getInlineStyle: PlasmoGetInlineStyle = () => {
  const element = document.createElement("style")
  element.textContent = cssText
  return element
}

const PlasmoOverlay = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const extractData = () => {
      // Basic mock extraction - to be expanded in Phase 2
      const title = document.title
      const url = window.location.href
      
      // Call API
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

    extractData()
  }, [])

  return (
    <div className="fixed top-4 right-4 z-[2147483647]">
      <TrustSidebar data={data} loading={loading} />
    </div>
  )
}

export default PlasmoOverlay
