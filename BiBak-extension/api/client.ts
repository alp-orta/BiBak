import { detectLocale } from "~i18n/translations"
import { API_BASE_URL } from "./config"

export interface ProductData {
  title: string
  price: string
  seller: string
  reviews: string[]
  rating: number
  locale?: string
  platform?: "trendyol" | "hepsiburada" | "amazon" | "unknown"
  product_id?: string
  url?: string
  scrape_metadata?: {
    productId?: string
    listingId?: string
    diagnostics?: {
      priceText?: string
      parsedPrice?: number | null
      priceSelector?: string
      selectedListingId?: string | null
      contentId?: string | null
      historySource?: string
      historyCount?: number
      historyCandidatesChecked?: number
      historySelectionReason?: string
    }
    source: string
    confidence: number
    reviewCount: number
    missingFields: string[]
    warnings: string[]
  }
  parsed_price?: {
    value: number | null
    currency: string | null
    raw: string
  }
  external_price_history?: {
    source: "trendyol_internal"
    listingId?: string
    contentId?: string
    candidatesChecked?: number
    selectedReason?: string
    prices: Record<string, number>
  }
}

export interface AnalysisData {
  trust_score: number
  review_authenticity_score: number
  price_integrity_score: number
  seller_reliability_score: number
  risk_flags: string[]
  explanations: string[]
  safer_alternatives: SaferAlternative[]
  review_analysis?: ReviewAnalysis | null
  price_analysis?: PriceAnalysis | null
  seller_analysis?: SellerAnalysis | null
  purchase_timing?: PurchaseTiming | null
  source?: "api" | "fallback"
  warnings?: string[]
}

export interface ReviewAnalysis {
  fraud_score: number
  suspicious_clusters: number
  cluster_data: unknown[]
  review_scores: Array<{
    index: number
    text_snippet?: string
    fraud_score: number
    anomaly_score?: number
    cluster_id?: number
    flags: string[]
  }>
}

export interface PriceAnalysis {
  current_price: number | null
  currency: string | null
  history_count: number
  observed_low: number | null
  observed_median: number | null
  observed_average?: number | null
  observed_high: number | null
  latest_history_price?: number | null
  current_vs_median?: number
  current_vs_average?: number
  discount_risk: string
  confidence: number
  score: number
  warnings: string[]
  explanation?: string
  source?: string
}

export interface SellerAnalysis {
  seller: string | null
  history_count: number
  observed_products: number
  average_rating?: number | null
  average_fraud_score?: number
  score: number
  confidence: number
  warnings: string[]
  explanation?: string
}

export interface PurchaseTiming {
  recommendation: "buy_now" | "wait" | "insufficient_data"
  confidence: number
  reason: string
}

export interface SaferAlternative {
  title?: string
  seller?: string
  url?: string
  price?: number
  currency?: string
  trust_score?: number
  reason?: string
}

const FALLBACK_TEXT = {
  tr: {
    backendUnavailable: "Sunucuya ulaşılamadı. Basit kontrol yapıldı.",
    limitedReviewData: "Yorum az olduğu için sonuç kesin değil.",
    repetitiveReviews: "Bazı yorumlar birbirine çok benziyor.",
    sparseProductData: "Fiyat veya satıcı bilgisi eksik.",
    stableSignals: "Temel bilgiler normal görünüyor."
  },
  en: {
    backendUnavailable: "The server is unavailable. A simple check was used.",
    limitedReviewData: "There are few reviews, so the result is not final.",
    repetitiveReviews: "Some reviews look very similar.",
    sparseProductData: "Price or seller info is missing.",
    stableSignals: "The basic info looks normal."
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

  let reviewAuthenticity = reviewCount === 0 ? 35 : 78
  reviewAuthenticity -= duplicateRatio * 45
  if (reviewCount > 0 && reviewCount < 2) reviewAuthenticity -= 23
  else if (reviewCount < 3) reviewAuthenticity -= 12
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
    warnings: reviewCount === 0 ? ["backend_unavailable", "no_reviews"] : ["backend_unavailable", "limited_review_data"]
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
