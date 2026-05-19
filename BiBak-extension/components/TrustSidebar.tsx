import React, { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Info, SearchCheck } from "lucide-react"
import { type Locale, type Translations, t, LOCALE_LABELS } from "~i18n/translations"
import { analyzeProduct, buildFallbackAnalysis, type AnalysisData } from "~api/client"
import type { ScrapedProduct } from "~scrapers"
import logoBlack from "data-base64:~assets/brand/logo/BiBak_logo_black.png"
import logoColored from "data-base64:~assets/brand/logo/BiBak_logo_colored.png"
import logoWhite from "data-base64:~assets/brand/logo/BiBak_logo_white.png"

const COLORS = {
  bg: "rgba(250, 252, 255, 0.98)",
  card: "#FFFFFF",
  softCard: "#F5F7FB",
  border: "rgba(23, 33, 107, 0.10)",
  text: "#17216b",
  textDim: "#64748B",
  accent: "#576cea",
  brandSoft: "#aab9e8",
  brandLight: "#9cb2f2",
  brandStart: "#576cea",
  brandMid: "#1f2787",
  brandEnd: "#17216b",
  blue: "#1f2787",
  green: "#3F9B68",
  greenLight: "#8DD9AA",
  greenSoft: "#ECFDF3",
  yellow: "#D97706",
  red: "#DC2626",
  orange: "#EA580C",
  caution: "#D97706",
  cautionSoft: "#FFF7ED",
  riskSoft: "#FEF2F2",
}

const LOCALE_STORAGE_KEY = "bibak-locale"
const REVIEW_DATA_WARNING_CODES = ["low_review_count", "no_reviews", "limited_review_data", "review_text_unavailable"]
const NON_PRODUCT_PAGE_WARNING = "not_product_page"

function BrandLogo({
  variant = "colored",
  width = 74
}: {
  variant?: "colored" | "white" | "black"
  width?: number
}) {
  const src = variant === "white" ? logoWhite : variant === "black" ? logoBlack : logoColored

  return (
    <img
      src={src}
      alt="BiBak"
      style={{
        display: "block",
        width,
        height: "auto",
        objectFit: "contain"
      }}
    />
  )
}

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored === "en" || stored === "tr" ? stored : "tr"
  } catch {
    return "tr"
  }
}

function getScoreColor(score: number) {
  return getScoreTone(score).text
}

function getScoreTone(score: number) {
  if (score >= 85) {
    return {
      start: "#BFEFD0",
      end: COLORS.green,
      text: COLORS.green,
      bar: COLORS.greenLight,
      inner: COLORS.green,
      badgeBg: COLORS.greenSoft,
      badgeText: COLORS.green
    }
  }

  if (score >= 70) {
    return {
      start: "#DDF8E8",
      end: COLORS.greenLight,
      text: COLORS.green,
      bar: COLORS.greenLight,
      inner: COLORS.green,
      badgeBg: COLORS.greenSoft,
      badgeText: COLORS.green
    }
  }

  if (score >= 50) {
    return {
      start: "#FBBF24",
      end: COLORS.caution,
      text: COLORS.caution,
      bar: COLORS.caution,
      inner: COLORS.caution,
      badgeBg: COLORS.cautionSoft,
      badgeText: COLORS.caution
    }
  }

  if (score >= 30) {
    return {
      start: COLORS.orange,
      end: COLORS.red,
      text: COLORS.orange,
      bar: COLORS.orange,
      inner: COLORS.orange,
      badgeBg: COLORS.riskSoft,
      badgeText: COLORS.orange
    }
  }

  return {
    start: COLORS.red,
    end: COLORS.red,
    text: COLORS.red,
    bar: COLORS.red,
    inner: COLORS.red,
    badgeBg: COLORS.riskSoft,
    badgeText: COLORS.red
  }
}

function getScoreRingTone(score: number) {
  if (score >= 85) {
    return {
      start: COLORS.brandSoft,
      end: COLORS.brandLight,
      text: COLORS.brandStart,
      inner: COLORS.brandSoft
    }
  }

  if (score >= 70) {
    return {
      start: COLORS.brandLight,
      end: COLORS.brandStart,
      text: COLORS.brandStart,
      inner: COLORS.brandLight
    }
  }

  if (score >= 50) {
    return {
      start: "#FBBF24",
      end: COLORS.caution,
      text: COLORS.caution,
      inner: COLORS.caution
    }
  }

  if (score >= 30) {
    return {
      start: COLORS.orange,
      end: COLORS.red,
      text: COLORS.orange,
      inner: COLORS.orange
    }
  }

  return {
    start: COLORS.red,
    end: COLORS.red,
    text: COLORS.red,
    inner: COLORS.red
  }
}

const SCORE_GRADIENT_ID = "bibak-score-gradient"

function getScoreLabel(score: number, strings: Translations) {
  if (score >= 85) return strings.veryTrusted
  if (score >= 70) return strings.trusted
  if (score >= 50) return strings.mixedSignals
  if (score >= 30) return strings.risky
  return strings.avoid
}

function getMetricStatusLabel(score: number, locale: Locale) {
  if (locale === "tr") {
    if (score >= 70) return "İyi"
    if (score >= 50) return "Dikkat"
    if (score >= 30) return "Risk"
    return "Yüksek risk"
  }

  if (score >= 70) return "Good"
  if (score >= 50) return "Caution"
  if (score >= 30) return "Risk"
  return "High risk"
}

function getRecommendation(score: number, locale: Locale) {
  if (locale === "tr") {
    if (score >= 85) return "İyi görünüyor. Yine de fiyatı kontrol edin."
    if (score >= 70) return "Genel olarak iyi. Küçük uyarıları okuyun."
    if (score >= 50) return "Biraz dikkat gerekiyor. Yorumlara ve fiyata bakın."
    if (score >= 30) return "Riskli görünüyor. Yorumları, fiyatı ve satıcıyı dikkatli kontrol edin."
    return "Bu ürün güven vermiyor. Almamak daha iyi olabilir."
  }

  if (score >= 85) return "Looks good. Still check the price."
  if (score >= 70) return "Mostly good. Read the small warnings."
  if (score >= 50) return "Be careful. Check reviews and price."
  if (score >= 30) return "Looks risky. Check reviews, price, and seller carefully."
  return "This does not look safe to buy."
}

function formatPriceSignal(value: string | undefined, locale: Locale) {
  const key = value || "unknown"
  const labels: Record<string, Record<Locale, string>> = {
    normal: { tr: "Normal", en: "Normal" },
    below_history: { tr: "İyi fiyat", en: "Good price" },
    suspicious_discount: { tr: "İndirime dikkat", en: "Check discount" },
    current_price_high: { tr: "Fiyat yüksek", en: "Price is high" },
    not_best_recent_price: { tr: "En düşük değil", en: "Not the lowest" },
    insufficient_history: { tr: "Az bilgi var", en: "Little data" },
    unknown: { tr: "Bilinmiyor", en: "Unknown" }
  }

  return labels[key]?.[locale] || key.replace(/_/g, " ")
}

function ScoreRing({ score, strings, size = 148 }: { score: number; strings: Translations; size?: number }) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const [dashOffset, setDashOffset] = useState(339.292)
  const tone = getScoreRingTone(score)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const label = getScoreLabel(score, strings)
  const labelFontSize = label.length > 10 ? 8 : 10

  useEffect(() => {
    const timer = setTimeout(() => {
      setDashOffset(circumference - (score / 100) * circumference)
      let current = 0
      const step = score / 40
      const interval = setInterval(() => {
        current += step
        if (current >= score) {
          setAnimatedScore(score)
          clearInterval(interval)
        } else {
          setAnimatedScore(Math.round(current))
        }
      }, 25)
    }, 300)
    return () => clearTimeout(timer)
  }, [score])

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <defs>
          <linearGradient id={SCORE_GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone.start} />
            <stop offset="100%" stopColor={tone.end} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(23, 33, 107, 0.08)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={`url(#${SCORE_GRADIENT_ID})`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
        <circle cx="60" cy="60" r={40} fill="none" stroke={tone.inner} strokeWidth="0.5" opacity="0.18" />
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        width: "100%", textAlign: "center", pointerEvents: "none"
      }}>
        <span style={{ fontSize: 38, fontWeight: 800, color: tone.text, lineHeight: 1, fontFamily: "'Open Sans', -apple-system, sans-serif" }}>
          {animatedScore}
        </span>
        <span style={{
          display: "block",
          width: 92,
          maxWidth: "72%",
          fontSize: labelFontSize,
          fontWeight: 800,
          color: COLORS.textDim,
          textTransform: "uppercase",
          letterSpacing: label.length > 10 ? 1.25 : 2,
          lineHeight: 1.2,
          marginTop: 5,
          whiteSpace: "normal",
          overflowWrap: "normal",
          wordBreak: "keep-all"
        }}>
          {label}
        </span>
      </div>
    </div>
  )
}

function isNonProductPage(scrapedData: ScrapedProduct | null) {
  return scrapedData?.metadata?.warnings?.includes(NON_PRODUCT_PAGE_WARNING) ?? false
}

function MetricBar({
  label,
  value,
  color,
  textColor,
  valueLabel,
  statusLabel
}: {
  label: string
  value: number
  color?: string
  textColor?: string
  valueLabel?: string
  statusLabel?: string
}) {
  const tone = getScoreTone(value)
  const barColor = color || tone.bar
  const labelColor = textColor || tone.text
  const [width, setWidth] = useState(0)
  useEffect(() => { setTimeout(() => setWidth(value), 400) }, [value])

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 500 }}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, color: labelColor, fontWeight: 700 }}>{valueLabel || `${value}%`}</span>
          {statusLabel && (
            <span style={{
              fontSize: 9,
              color: tone.badgeText,
              background: tone.badgeBg,
              border: `1px solid ${tone.badgeText}22`,
              borderRadius: 999,
              padding: "1px 5px",
              fontWeight: 700,
              lineHeight: 1.35
            }}>
              {statusLabel}
            </span>
          )}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "rgba(23, 33, 107, 0.08)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3, background: barColor,
          width: `${width}%`, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: `0 0 8px ${barColor}33`,
        }} />
      </div>
    </div>
  )
}

function RiskFlag({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
      background: "#FEF2F2", borderRadius: 10,
      border: "1px solid rgba(220, 38, 38, 0.18)", marginBottom: 6,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <span style={{ fontSize: 12, color: "#991B1B", fontWeight: 600, lineHeight: 1.4 }}>{text}</span>
    </div>
  )
}

function isWarningExplanation(text: string) {
  const normalized = text.toLocaleLowerCase("tr-TR")
  return (
    normalized.includes("api") ||
    normalized.includes("yerel analiz") ||
    normalized.includes("local analysis") ||
    normalized.includes("sınırlı") ||
    normalized.includes("limited") ||
    normalized.includes("henüz yorum") ||
    normalized.includes("no reviews")
  )
}

function getExplanationTone(text: string) {
  const normalized = text.toLocaleLowerCase("tr-TR")

  if (
    normalized.includes("uyumlu") ||
    normalized.includes("tutarlı") ||
    normalized.includes("güven veren") ||
    normalized.includes("belirgin şüpheli yorum yok") ||
    normalized.includes("şüphe görünmüyor") ||
    normalized.includes("şüpheli yorum yok") ||
    normalized.includes("normal görünüyor") ||
    normalized.includes("nothing clearly suspicious") ||
    normalized.includes("do not look suspicious") ||
    normalized.includes("looks normal") ||
    normalized.includes("consistent") ||
    normalized.includes("aligned") ||
    normalized.includes("no strong")
  ) {
    return {
      Icon: CheckCircle2,
      bg: "#F0FDF4",
      border: "rgba(22, 163, 74, 0.22)",
      iconColor: "#16A34A",
      textColor: "#475569"
    }
  }

  if (
    isWarningExplanation(text) ||
    normalized.includes("risk") ||
    normalized.includes("anormal") ||
    normalized.includes("şüpheli") ||
    normalized.includes("suspicious") ||
    normalized.includes("inconsistency") ||
    normalized.includes("tutarsız")
  ) {
    return {
      Icon: AlertTriangle,
      bg: COLORS.cautionSoft,
      border: "rgba(234, 88, 12, 0.22)",
      iconColor: COLORS.caution,
      textColor: "#64748B"
    }
  }

  return {
    Icon: Info,
    bg: "#EEF2FF",
    border: "rgba(87, 108, 234, 0.16)",
    iconColor: COLORS.brandStart,
    textColor: COLORS.textDim
  }
}

function ExplanationCard({ text }: { text: string }) {
  const tone = getExplanationTone(text)
  const Icon = tone.Icon

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
      background: tone.bg, borderRadius: 10,
      border: `1px solid ${tone.border}`, marginBottom: 6,
    }}>
      <Icon size={15} strokeWidth={2.4} color={tone.iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ display: "block", fontSize: 12, color: tone.textColor, lineHeight: 1.4 }}>
        {text}
      </span>
    </div>
  )
}

function parsePriceText(price?: string): { value: number | null; currency: string | null; raw: string } {
  const rawPrice = price || ""
  const normalizedText = rawPrice.replace(/\u00a0/g, " ")
  const matches = Array.from(normalizedText.matchAll(/(?:([$€£₺])\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(TL|TRY|USD|EUR|GBP|₺|[$€£]))/gi))
  const productPriceMatches = matches
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const end = (item.index ?? 0) + item[0].length
      return !/^\s*(?:\/|per\b|başına\b|adet\b|tablet\b|kapsül\b|kg\b|g\b|gr\b|ml\b|l\b|lt\b|unit\b|piece\b|pcs\b)/i.test(normalizedText.slice(end, end + 32))
    })
  const basketPriceMatches = productPriceMatches.filter(({ item, index }) => {
    const previousEnd = index > 0 ? (matches[index - 1].index ?? 0) + matches[index - 1][0].length : Math.max(0, (item.index ?? 0) - 48)
    return normalizedText.slice(previousEnd, item.index ?? 0).toLocaleLowerCase("tr-TR").includes("sepette")
  })
  const match = (basketPriceMatches[0] || productPriceMatches.at(-1))?.item
  if (!match) return { value: null, currency: null, raw: rawPrice }

  const number = match[2] || match[3]
  const normalized = number.includes(",")
    ? number.replace(/\./g, "").replace(",", ".")
    : number.split(".").length > 1 && number.split(".").at(-1)?.length === 3
      ? number.replace(/\./g, "")
      : number
  const value = Number(normalized)
  const marker = (match[1] || match[4] || "").toUpperCase()
  const currencyMap: Record<string, string> = { "₺": "TRY", TL: "TRY", TRY: "TRY", "$": "USD", USD: "USD", "€": "EUR", EUR: "EUR", "£": "GBP", GBP: "GBP" }

  return {
    value: Number.isFinite(value) ? value : null,
    currency: Number.isFinite(value) ? currencyMap[marker] || "TRY" : null,
    raw: rawPrice
  }
}

function formatMoney(value?: number | null, currency?: string | null) {
  if (typeof value !== "number") return "N/A"
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currency || "TRY",
      maximumFractionDigits: 2
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency || ""}`.trim()
  }
}

function formatOptionalMoney(value: number | null | undefined, currency: string | null | undefined, locale: Locale) {
  if (typeof value !== "number") return locale === "tr" ? "Fiyat bilgisi yok" : "No price info"
  return formatMoney(value, currency)
}

function MiniStat({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 10,
      fontSize: 11, lineHeight: 1.35, color: COLORS.textDim, marginTop: 5
    }}>
      <span>{label}</span>
      <strong style={{ color: valueColor || COLORS.text, fontWeight: 700, textAlign: "right" }}>{value}</strong>
    </div>
  )
}

function RecommendationCard({ score, locale, strings }: { score: number; locale: Locale; strings: Translations }) {
  const color = getScoreColor(score)
  return (
    <div style={{
      margin: "0 16px 12px",
      padding: "11px 12px",
      background: "#F2F5FF",
      border: `1px solid ${color}33`,
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: COLORS.brandStart, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 }}>
        {strings.recommendation}
      </div>
      <p style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.45, margin: 0 }}>
        {getRecommendation(score, locale)}
      </p>
    </div>
  )
}

function ScoreFormulaPanel({ data, strings }: { data: AnalysisData; strings: Translations }) {
  const rows = [
    { label: strings.reviewAuthenticity, value: data.review_authenticity_score, weight: 45 },
    { label: strings.priceIntegrity, value: data.price_integrity_score, weight: 30 },
    { label: strings.sellerReliability, value: data.seller_reliability_score, weight: 25 },
  ]

  return (
    <InsightPanel title={strings.scoreFormula}>
      <p style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4, margin: "0 0 9px" }}>
        {strings.scoreFormulaSub}
      </p>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: COLORS.textDim }}>{row.label}</span>
          <strong style={{ fontSize: 11, color: getScoreColor(row.value), fontWeight: 800 }}>{row.value}</strong>
          <span style={{ fontSize: 10, color: COLORS.textDim, textAlign: "right" }}>%{row.weight}</span>
        </div>
      ))}
    </InsightPanel>
  )
}

function InsightPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "0 16px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 6px 18px rgba(23, 33, 107, 0.05)"
      }}>
        {children}
      </div>
    </div>
  )
}

function PriceTimingPanel({ data, locale }: { data: AnalysisData; locale: Locale }) {
  if (!data.price_analysis && !data.purchase_timing) return null
  const price = data.price_analysis
  const timing = data.purchase_timing
  const hasPriceHistory = (price?.history_count ?? 0) > 0
  const averagePrice = price?.observed_average ?? null
  const currentPrice = price?.current_price ?? null
  const lowPrice = hasPriceHistory ? price?.observed_low : null
  const highPrice = hasPriceHistory ? price?.observed_high : null
  const shownAveragePrice = hasPriceHistory ? averagePrice : null
  const currentColor = averagePrice != null && currentPrice != null
    ? currentPrice < averagePrice
      ? COLORS.blue
      : currentPrice > averagePrice
        ? COLORS.orange
        : COLORS.text
    : COLORS.text
  const analysisText = price?.explanation || timing?.reason

  return (
    <InsightPanel title={locale === "tr" ? "Fiyat" : "Price"}>
      {price && (
        <>
          <MiniStat label={locale === "tr" ? "Fiyat durumu" : "Price status"} value={formatPriceSignal(price.discount_risk, locale)} valueColor={getScoreColor(price.score)} />
          <MiniStat label={locale === "tr" ? "Fiyat kaydı" : "Saved prices"} value={price.history_count} />
          <MiniStat label={locale === "tr" ? "En düşük" : "Low"} value={formatOptionalMoney(lowPrice, price.currency, locale)} />
          <MiniStat label={locale === "tr" ? "En yüksek" : "High"} value={formatOptionalMoney(highPrice, price.currency, locale)} />
          <MiniStat label={locale === "tr" ? "Ortalama" : "Average"} value={formatOptionalMoney(shownAveragePrice, price.currency, locale)} />
          <MiniStat label={locale === "tr" ? "Güncel" : "Current"} value={formatOptionalMoney(currentPrice, price.currency, locale)} valueColor={currentColor} />
        </>
      )}
      {analysisText && (
        <p style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4, margin: "8px 0 0" }}>
          {analysisText}
        </p>
      )}
    </InsightPanel>
  )
}

function ReviewEvidencePanel({ data, locale, strings }: { data: AnalysisData; locale: Locale; strings: Translations }) {
  const reviewAnalysis = data.review_analysis
  if (!reviewAnalysis) return null
  const reviewScores = Array.isArray(reviewAnalysis.review_scores) ? reviewAnalysis.review_scores : []
  if (reviewScores.length === 0 || data.warnings?.includes("no_reviews")) return null

  const highRiskReviews = reviewScores.filter((review) => review.fraud_score >= 60)
  const hasSimilarGroups = reviewAnalysis.suspicious_clusters > 0
  const sampleReviews = highRiskReviews
    .filter((review) => review.text_snippet)
    .slice(0, 2)

  return (
    <InsightPanel title={strings.reviewEvidence}>
      <MiniStat label={strings.similarReviewGroups} value={reviewAnalysis.suspicious_clusters} valueColor={reviewAnalysis.suspicious_clusters > 0 ? COLORS.orange : COLORS.blue} />
      <MiniStat label={strings.highRiskReviews} value={highRiskReviews.length} valueColor={highRiskReviews.length > 0 ? COLORS.orange : COLORS.blue} />
      {sampleReviews.length > 0 ? (
        <div style={{ marginTop: 9 }}>
          {sampleReviews.map((review) => (
            <p key={review.index} style={{
              margin: "6px 0 0",
              padding: "8px 9px",
              borderRadius: 8,
              background: "#FFF7ED",
              border: "1px solid rgba(234, 88, 12, 0.18)",
              color: "#9A3412",
              fontSize: 11,
              lineHeight: 1.35
            }}>
              “{review.text_snippet}”
            </p>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4, margin: "8px 0 0" }}>
          {hasSimilarGroups ? strings.similarReviewGroupNotice : strings.noReviewManipulation}
        </p>
      )}
      {locale === "tr" && highRiskReviews.length > 0 && (
        <p style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4, margin: "8px 0 0" }}>
          Benzer yorumlar puanı düşürür. Satın almadan önce orta puanlı yorumlara da bakın.
        </p>
      )}
      {locale === "en" && highRiskReviews.length > 0 && (
        <p style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.4, margin: "8px 0 0" }}>
          Similar reviews lower the score. Check middle-rated reviews too.
        </p>
      )}
    </InsightPanel>
  )
}

function LowReviewNotice({ data, scrapedData, locale }: { data: AnalysisData; scrapedData: ScrapedProduct | null; locale: Locale }) {
  const warnings = new Set([...(scrapedData?.metadata?.warnings || []), ...(data.warnings || [])])
  const reviewCount = scrapedData?.metadata?.reviewCount ?? scrapedData?.reviews.length ?? 0
  const scrapedReviewCount = scrapedData?.reviews.length ?? 0
  const show = REVIEW_DATA_WARNING_CODES.some((warning) => warnings.has(warning)) || reviewCount < 3
  if (!show) return null

  const message = warnings.has("review_text_unavailable")
    ? locale === "tr"
      ? `Sayfada ${reviewCount} yorum görünüyor, ancak BiBak yalnızca ${scrapedReviewCount} yorum metni okuyabildi. Sonuç sınırlı.`
      : `Amazon shows ${reviewCount} reviews, but BiBak could only read ${scrapedReviewCount} review texts. The result is limited.`
    : locale === "tr"
      ? `Yorum az (${reviewCount}). Sonuç kesin değil.`
      : `Few reviews (${reviewCount}). The result is not final.`

  return (
    <div style={{
      margin: "0 16px 12px",
      padding: "9px 11px",
      background: "rgba(234, 179, 8, 0.08)",
      border: "1px solid rgba(234, 179, 8, 0.18)",
      borderRadius: 10,
      color: "#92400E",
      fontSize: 11,
      lineHeight: 1.4
    }}>
      {message}
    </div>
  )
}

function StatusNotice({ source, warnings, strings }: { source?: string; warnings?: string[]; strings: Translations }) {
  const statusWarnings = (warnings || []).filter((warning) => !REVIEW_DATA_WARNING_CODES.includes(warning))
  if (source !== "fallback" && statusWarnings.length === 0) return null

  const isFallback = source === "fallback"
  const hasPriceHistoryMismatch = statusWarnings.includes("live_price_differs_from_history")
  const message = isFallback
    ? strings.localFallbackNotice
    : hasPriceHistoryMismatch
      ? strings.priceHistoryMismatchNotice
      : strings.limitedDataNotice

  return (
    <div style={{
      margin: "0 16px 12px", padding: "10px 12px",
      background: isFallback ? "rgba(234, 179, 8, 0.08)" : "rgba(99, 102, 241, 0.06)",
      border: `1px solid ${isFallback ? "rgba(234, 179, 8, 0.18)" : "rgba(99, 102, 241, 0.12)"}`,
      borderRadius: 10,
      color: isFallback ? "#92400E" : COLORS.textDim,
      fontSize: 11,
      lineHeight: 1.4
    }}>
      {message}
    </div>
  )
}

function LanguageToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const next: Locale = locale === "tr" ? "en" : "tr"
  return (
    <button
      onClick={() => onChange(next)}
      style={{
        background: "rgba(23, 33, 107, 0.06)", border: "1px solid rgba(23, 33, 107, 0.08)",
        color: "#17216b", cursor: "pointer", borderRadius: 6,
        padding: "3px 8px", fontSize: 10, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 4,
        transition: "background 0.2s", fontFamily: "'Open Sans', sans-serif",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(23, 33, 107, 0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(23, 33, 107, 0.06)")}
    >
      <span style={{ fontSize: 12 }}>🌐</span>
      {LOCALE_LABELS[next]}
    </button>
  )
}

function MinimizeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="BiBak panelini küçült"
      style={{
        background: "rgba(23, 33, 107, 0.06)",
        border: "1px solid rgba(23, 33, 107, 0.08)",
        color: "#17216b",
        cursor: "pointer",
        borderRadius: 6,
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(23, 33, 107, 0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(23, 33, 107, 0.06)")}
    >
      ✕
    </button>
  )
}

const containerStyle: React.CSSProperties = {
  width: 320,
  maxHeight: "calc(100vh - 32px)",
  background: COLORS.bg,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(255,255,255,0.85) inset",
  fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "thin",
  color: COLORS.text,
}

export const TrustSidebar = ({ scrapedData, scrapeError }: { scrapedData: ScrapedProduct | null, scrapeError: string | null }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [locale, setLocale] = useState<Locale>(getInitialLocale)
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverWaking, setServerWaking] = useState(false)
  const strings = t(locale)
  const reviewCount = scrapedData?.metadata?.reviewCount ?? scrapedData?.reviews.length ?? 0

  const handleLocaleChange = (nextLocale: Locale) => {
    setLocale(nextLocale)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      if (scrapeError) {
        setLoading(false)
        return
      }

      if (!scrapedData) {
        setLoading(true)
        return
      }

      if (isNonProductPage(scrapedData)) {
        setData(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const productPayload = {
          title: scrapedData.title,
          price: scrapedData.price,
          seller: scrapedData.seller,
          reviews: scrapedData.reviews,
          review_details: scrapedData.reviewDetails,
          rating: scrapedData.rating,
          locale,
          platform: scrapedData.platform,
          product_id: scrapedData.metadata?.productId,
          url: window.location.href,
          scrape_metadata: scrapedData.metadata,
          parsed_price: parsePriceText(scrapedData.price),
          external_price_history: scrapedData.priceHistory,
          seller_metadata: scrapedData.sellerMetadata
        }
        const res = await analyzeProduct(productPayload)
        setData(res)
      } catch (err) {
        console.error(err)
        setData(buildFallbackAnalysis({
          title: scrapedData.title || "",
          price: scrapedData.price || "",
          seller: scrapedData.seller || "",
          reviews: scrapedData.reviews || [],
          rating: scrapedData.rating || 0,
          locale,
          platform: scrapedData.platform,
          product_id: scrapedData.metadata?.productId,
          url: window.location.href,
          scrape_metadata: scrapedData.metadata,
          parsed_price: parsePriceText(scrapedData.price),
          external_price_history: scrapedData.priceHistory,
          seller_metadata: scrapedData.sellerMetadata
        }, locale))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [locale, scrapedData, scrapeError])

  useEffect(() => {
    if (!loading) {
      setServerWaking(false)
      return
    }

    const timer = window.setTimeout(() => setServerWaking(true), 7000)
    return () => window.clearTimeout(timer)
  }, [loading])

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="BiBak panelini aç"
        style={{
          width: 52,
          height: 52,
          borderRadius: "12px 0 0 12px",
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          boxShadow: "0 10px 36px rgba(15, 23, 42, 0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          transform: "translateX(18px)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          fontFamily: "'Open Sans', sans-serif",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateX(0)"
          e.currentTarget.style.boxShadow = "0 12px 42px rgba(15, 23, 42, 0.24)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateX(18px)"
          e.currentTarget.style.boxShadow = "0 10px 36px rgba(15, 23, 42, 0.18)"
        }}
      >
        <SearchCheck size={24} strokeWidth={2.3} color={COLORS.brandMid} />
      </button>
    )
  }

  if (scrapeError) {
    return (
      <div style={{
        ...containerStyle,
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 200, gap: 16, padding: 20, textAlign: "center"
      }}>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <MinimizeButton onClick={() => setCollapsed(true)} />
        </div>
        <div style={{ fontSize: 32 }}>⚠️</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.red, margin: 0 }}>
          Veri Çekilemedi / Could not extract data
        </p>
        <p style={{ fontSize: 11, color: COLORS.textDim, margin: 0 }}>
          {scrapeError}
        </p>
      </div>
    )
  }

  if (isNonProductPage(scrapedData)) {
    return (
      <div style={{
        ...containerStyle,
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 220, gap: 12, padding: 20, textAlign: "center"
      }}>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <MinimizeButton onClick={() => setCollapsed(true)} />
        </div>
        <div style={{
          width: 94, height: 38, borderRadius: 12,
          background: "rgba(99, 102, 241, 0.12)",
          border: "1px solid rgba(99, 102, 241, 0.18)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <BrandLogo variant="colored" width={68} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, margin: 0 }}>
          {strings.openProductPage}
        </p>
        <p style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.45, margin: 0 }}>
          {strings.openProductPageSub}
        </p>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div style={{
        ...containerStyle,
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 300, gap: 16,
      }}>
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <MinimizeButton onClick={() => setCollapsed(true)} />
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          border: "3px solid rgba(99, 102, 241, 0.15)", borderTopColor: COLORS.accent,
          animation: "bibak-spin 0.8s linear infinite",
        }} />
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, textAlign: "center", margin: 0 }}>
            {serverWaking ? strings.serverWaking : strings.analyzing}
          </p>
          <p style={{ fontSize: 11, color: COLORS.textDim, textAlign: "center", margin: "4px 0 0" }}>
            {serverWaking ? strings.serverWakingSub : strings.analyzingSub}
          </p>
        </div>
        <style>{`@keyframes bibak-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(23, 33, 107, 0.14)",
        background: "#FFFFFF",
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 92,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px"
          }}>
            <BrandLogo variant="colored" width={84} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LanguageToggle locale={locale} onChange={handleLocaleChange} />
          <MinimizeButton onClick={() => setCollapsed(true)} />
        </div>
      </div>

      {/* Score Section */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 16px 12px",
        position: "relative"
      }}>
        <ScoreRing score={data.trust_score} strings={strings} />
        {loading && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(250,252,255,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 16, zIndex: 10
          }}>
            <div style={{ width: 20, height: 20, border: "2px solid #6366F1", borderTopColor: "transparent", borderRadius: "50%", animation: "bibak-spin 0.6s linear infinite" }} />
          </div>
        )}
      </div>

      <RecommendationCard score={data.trust_score} locale={locale} strings={strings} />
      <LowReviewNotice data={data} scrapedData={scrapedData} locale={locale} />

      {/* Metrics */}
      <div style={{ padding: "0 16px 16px" }}>
        <MetricBar
          label={strings.reviewAuthenticity}
          value={data.review_authenticity_score}
          color={getScoreTone(data.review_authenticity_score).bar}
          textColor={reviewCount === 0 ? COLORS.orange : getScoreTone(data.review_authenticity_score).text}
          valueLabel={reviewCount === 0 ? strings.noReviewsMetric : undefined}
          statusLabel={reviewCount === 0 ? undefined : getMetricStatusLabel(data.review_authenticity_score, locale)}
        />
        <MetricBar
          label={strings.priceIntegrity}
          value={data.price_integrity_score}
          statusLabel={getMetricStatusLabel(data.price_integrity_score, locale)}
        />
        <MetricBar
          label={strings.sellerReliability}
          value={data.seller_reliability_score}
          statusLabel={getMetricStatusLabel(data.seller_reliability_score, locale)}
        />
      </div>

      <StatusNotice source={data.source} warnings={data.warnings} strings={strings} />

      {/* Risk Flags */}
      {(data.risk_flags || []).length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.red, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            {strings.riskAlerts}
          </div>
          {(data.risk_flags || []).map((flag, i) => <RiskFlag key={i} text={flag} />)}
        </div>
      )}

      <PriceTimingPanel data={data} locale={locale} />

      {/* Explanations */}
      {(data.explanations || []).length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            {strings.analysis}
          </div>
          {(data.explanations || []).map((exp, i) => <ExplanationCard key={i} text={exp} />)}
        </div>
      )}

      <ReviewEvidencePanel data={data} locale={locale} strings={strings} />

      <ScoreFormulaPanel data={data} strings={strings} />

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "center" }}>
        <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 600 }}>{strings.poweredBy}</span>
      </div>
    </div>
  )
}
