import { detectLocale } from "~i18n/translations"
import { API_BASE_URL } from "./config"

export interface ProductData {
  title: string
  price: string
  seller: string
  reviews: string[]
  rating: number
  locale?: string
}

export interface AnalysisData {
  trust_score: number
  review_authenticity_score: number
  price_integrity_score: number
  seller_reliability_score: number
  risk_flags: string[]
  explanations: string[]
  safer_alternatives: string[]
  source?: "api" | "fallback"
  warnings?: string[]
}

const FALLBACK_TEXT = {
  tr: {
    backendUnavailable: "Yerel analiz kullanildi; ayrintili API analizi su anda ulasilamiyor.",
    limitedReviewData: "Yeterli yorum verisi olmadigi icin sonuc sinirli guven sinyallerine dayaniyor.",
    repetitiveReviews: "Yorumlarda tekrar eden kaliplar goruluyor.",
    sparseProductData: "Urun sayfasinda fiyat veya satici bilgisi eksik.",
    stableSignals: "Temel urun sinyalleri belirgin bir tutarsizlik gostermiyor."
  },
  en: {
    backendUnavailable: "Local analysis was used because the API is currently unavailable.",
    limitedReviewData: "The result is based on limited trust signals because review data is sparse.",
    repetitiveReviews: "Repeated patterns were detected in the reviews.",
    sparseProductData: "Price or seller information is missing on the product page.",
    stableSignals: "The basic product signals do not show a clear inconsistency."
  }
} as const

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeReview(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildFallbackAnalysis(data: ProductData, locale: "tr" | "en"): AnalysisData {
  const strings = FALLBACK_TEXT[locale]
  const normalizedReviews = data.reviews.map(normalizeReview).filter(Boolean)
  const uniqueReviews = new Set(normalizedReviews)
  const reviewCount = normalizedReviews.length
  const duplicateRatio = reviewCount > 0 ? 1 - uniqueReviews.size / reviewCount : 0
  const avgReviewLength =
    reviewCount > 0
      ? normalizedReviews.reduce((sum, review) => sum + review.length, 0) / reviewCount
      : 0

  let reviewAuthenticity = 78
  reviewAuthenticity -= duplicateRatio * 45
  if (reviewCount < 3) reviewAuthenticity -= 12
  if (avgReviewLength > 0 && avgReviewLength < 45) reviewAuthenticity -= 10

  let sellerReliability = data.rating > 0 ? data.rating * 20 : 65
  if (!data.seller || data.seller === "N/A") sellerReliability -= 15
  if (reviewCount < 3) sellerReliability -= 5

  let priceIntegrity = 85
  if (!data.price || data.price === "N/A") priceIntegrity -= 20

  const trustScore =
    reviewAuthenticity * 0.45 +
    sellerReliability * 0.3 +
    priceIntegrity * 0.25

  const riskFlags: string[] = []
  const explanations: string[] = [strings.backendUnavailable]

  if (reviewCount < 2) {
    explanations.push(strings.limitedReviewData)
  }

  if (duplicateRatio >= 0.3) {
    riskFlags.push(strings.repetitiveReviews)
  }

  if (!data.price || data.price === "N/A" || !data.seller || data.seller === "N/A") {
    riskFlags.push(strings.sparseProductData)
  }

  if (riskFlags.length === 0) {
    explanations.push(strings.stableSignals)
  }

  return {
    trust_score: clamp(trustScore),
    review_authenticity_score: clamp(reviewAuthenticity),
    price_integrity_score: clamp(priceIntegrity),
    seller_reliability_score: clamp(sellerReliability),
    risk_flags: riskFlags,
    explanations,
    safer_alternatives: [],
    source: "fallback",
    warnings: ["backend_unavailable"]
  }
}

export const analyzeProduct = async (data: ProductData): Promise<AnalysisData> => {
  const locale = (data.locale || detectLocale()) as "tr" | "en"
  const payload = { ...data, locale }

  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      const result = await chrome.runtime.sendMessage({
        type: "analyze-product",
        payload
      })

      if (result?.ok) {
        return result.data
      }

      throw new Error(result?.error || "Background analysis failed")
    }

    const response = await fetch(`${API_BASE_URL}/analyze-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) throw new Error("Network response was not ok")
    return await response.json()
  } catch (error) {
    console.error("Failed to connect to backend", error)
    return buildFallbackAnalysis(data, locale)
  }
}
