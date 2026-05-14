export type Locale = "tr" | "en"

export interface Translations {
  trustAnalysis: string
  analyzing: string
  analyzingSub: string
  score: string
  trusted: string
  caution: string
  risky: string
  dangerous: string
  reviewAuthenticity: string
  priceIntegrity: string
  sellerReliability: string
  riskAlerts: string
  analysis: string
  localFallbackNotice: string
  limitedDataNotice: string
  poweredBy: string
  language: string
}

const tr: Translations = {
  trustAnalysis: "Güven Analizi",
  analyzing: "Ürün analiz ediliyor...",
  analyzingSub: "Yorumlar ve fiyat kontrol ediliyor",
  score: "Puan",
  trusted: "Güvenilir",
  caution: "Dikkat",
  risky: "Riskli",
  dangerous: "Tehlikeli",
  reviewAuthenticity: "Yorum Güvenilirliği",
  priceIntegrity: "Fiyat Tutarlılığı",
  sellerReliability: "Satıcı Güvenilirliği",
  riskAlerts: "Risk Uyarıları",
  analysis: "Analiz",
  localFallbackNotice: "API'ye ulaşılamadı; bu sonuç sınırlı yerel analizle üretildi.",
  limitedDataNotice: "Yorum verisi sınırlı olduğu için sonuç daha temkinli değerlendirilmelidir.",
  poweredBy: "BiBak AI tarafından desteklenmektedir · v1.0",
  language: "Dil",
}

const en: Translations = {
  trustAnalysis: "Trust Analysis",
  analyzing: "Analyzing product...",
  analyzingSub: "Checking reviews & pricing",
  score: "Score",
  trusted: "Trusted",
  caution: "Caution",
  risky: "Risky",
  dangerous: "Dangerous",
  reviewAuthenticity: "Review Authenticity",
  priceIntegrity: "Price Integrity",
  sellerReliability: "Seller Reliability",
  riskAlerts: "Risk Alerts",
  analysis: "Analysis",
  localFallbackNotice: "The API was unavailable; this result was generated with limited local analysis.",
  limitedDataNotice: "Review data is limited, so this result should be treated cautiously.",
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
