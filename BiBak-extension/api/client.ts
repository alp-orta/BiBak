import { detectLocale } from "~i18n/translations"

const API_URL = "http://localhost:8000"

export interface ProductData {
  title: string
  price: string
  seller: string
  reviews: string[]
  rating: number
  locale?: string
}

export const analyzeProduct = async (data: ProductData) => {
  const locale = data.locale || detectLocale()

  try {
    const response = await fetch(`${API_URL}/analyze-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, locale }),
    })

    if (!response.ok) throw new Error("Network response was not ok")
    return await response.json()
  } catch (error) {
    console.error("Failed to connect to backend", error)
    // Fallback mock data in Turkish
    const isTr = locale === "tr"
    return {
      trust_score: 45,
      review_authenticity_score: 30,
      price_integrity_score: 60,
      seller_reliability_score: 50,
      risk_flags: isTr
        ? ["Yüksek hacimli özdeş yorumlar tespit edildi", "Son dönemde fiyat artışı algılandı"]
        : ["High volume of identical reviews", "Recent price spike detected"],
      explanations: isTr
        ? ["Yorumlar güçlü kümelenme gösteriyor, olası bot aktivitesi."]
        : ["The reviews show strong clustering indicating possible bot activity."],
      safer_alternatives: [],
    }
  }
}
