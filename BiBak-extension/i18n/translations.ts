export type Locale = "tr" | "en"

export interface Translations {
  trustAnalysis: string
  analyzing: string
  analyzingSub: string
  serverWaking: string
  serverWakingSub: string
  openProductPage: string
  openProductPageSub: string
  score: string
  veryTrusted: string
  trusted: string
  mixedSignals: string
  risky: string
  avoid: string
  reviewAuthenticity: string
  noReviewsMetric: string
  priceIntegrity: string
  sellerReliability: string
  scoreFormula: string
  scoreFormulaSub: string
  recommendation: string
  reviewEvidence: string
  highRiskReviews: string
  similarReviewGroups: string
  noReviewManipulation: string
  similarReviewGroupNotice: string
  priceSignal: string
  riskAlerts: string
  analysis: string
  localFallbackNotice: string
  limitedDataNotice: string
  priceHistoryMismatchNotice: string
  poweredBy: string
  language: string
}

const tr: Translations = {
  trustAnalysis: "Güven Analizi",
  analyzing: "Ürün analiz ediliyor...",
  analyzingSub: "Yorumlar ve fiyat kontrol ediliyor",
  serverWaking: "Sunucu hazırlanıyor...",
  serverWakingSub: "Yerel API başlatılıyorsa birkaç saniye sürebilir.",
  openProductPage: "Analiz için bir ürün sayfası açın.",
  openProductPageSub: "BiBak sadece ürün sayfalarında çalışır.",
  score: "Puan",
  veryTrusted: "Çok Güvenilir",
  trusted: "Güvenilir",
  mixedSignals: "Dikkat",
  risky: "Riskli",
  avoid: "Uzak Dur",
  reviewAuthenticity: "Yorum Güvenilirliği",
  noReviewsMetric: "Yorum yok",
  priceIntegrity: "Fiyat Tutarlılığı",
  sellerReliability: "Satıcı Güvenilirliği",
  scoreFormula: "Puan Nasıl Oluştu?",
  scoreFormulaSub: "Puan; yorum, fiyat ve satıcı bilgilerine göre hesaplanır.",
  recommendation: "Öneri",
  reviewEvidence: "Yorum Kanıtı",
  highRiskReviews: "Yüksek riskli yorum",
  similarReviewGroups: "Benzer yorum grubu",
  noReviewManipulation: "Yorumlarda belirgin bir şüphe görünmüyor.",
  similarReviewGroupNotice: "Benzer yorum grupları var, ancak tekil yorumlarda yüksek risk görünmüyor.",
  priceSignal: "Fiyat Sinyali",
  riskAlerts: "Risk Uyarıları",
  analysis: "Analiz",
  localFallbackNotice: "Sunucuya ulaşılamadı. Sonuç daha basit bir kontrolle hazırlandı.",
  limitedDataNotice: "Yorum az olduğu için bu sonucu dikkatli okuyun.",
  priceHistoryMismatchNotice: "Şu anki fiyat, kayıtlı fiyatlardan farklı görünüyor.",
  poweredBy: "BiBak AI tarafından desteklenmektedir · v1.0",
  language: "Dil",
}

const en: Translations = {
  trustAnalysis: "Trust Analysis",
  analyzing: "Analyzing product...",
  analyzingSub: "Checking reviews & pricing",
  serverWaking: "Server is loading up...",
  serverWakingSub: "If the local API is starting, this can take a few seconds.",
  openProductPage: "Open a product page to analyze.",
  openProductPageSub: "BiBak works only on product pages.",
  score: "Score",
  veryTrusted: "Very Trusted",
  trusted: "Trusted",
  mixedSignals: "Caution",
  risky: "Risky",
  avoid: "Avoid",
  reviewAuthenticity: "Review Authenticity",
  noReviewsMetric: "No reviews",
  priceIntegrity: "Price Integrity",
  sellerReliability: "Seller Reliability",
  scoreFormula: "How The Score Is Built",
  scoreFormulaSub: "The score uses reviews, price, and seller info.",
  recommendation: "Recommendation",
  reviewEvidence: "Review Evidence",
  highRiskReviews: "High-risk reviews",
  similarReviewGroups: "Similar review groups",
  noReviewManipulation: "The visible reviews do not look suspicious.",
  similarReviewGroupNotice: "Similar review groups were found, but no individual review looks high risk.",
  priceSignal: "Price Signal",
  riskAlerts: "Risk Alerts",
  analysis: "Analysis",
  localFallbackNotice: "The server is unavailable. This result used a simpler check.",
  limitedDataNotice: "There are few reviews, so read this result carefully.",
  priceHistoryMismatchNotice: "The current price looks different from saved prices.",
  poweredBy: "Powered by BiBak AI · v1.0",
  language: "Language",
}

const locales: Record<Locale, Translations> = { tr, en }

export function detectLocale(): Locale {
  const lang = (navigator.language || navigator.languages?.[0] || "").toLowerCase()
  if (lang.startsWith("en")) return "en"
  return "tr"
}

export function t(locale: Locale): Translations {
  return locales[locale]
}

export const LOCALE_LABELS: Record<Locale, string> = { tr: "Türkçe", en: "English" }
