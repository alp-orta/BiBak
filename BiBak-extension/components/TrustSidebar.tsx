import React, { useEffect, useState } from "react"
import { type Locale, type Translations, t, LOCALE_LABELS } from "~i18n/translations"
import { analyzeProduct, type AnalysisData } from "~api/client"
import type { ScrapedProduct } from "~scrapers"

const COLORS = {
  bg: "rgba(15, 17, 23, 0.95)",
  card: "rgba(30, 34, 46, 0.85)",
  border: "rgba(255,255,255,0.06)",
  text: "#E2E8F0",
  textDim: "#94A3B8",
  accent: "#6366F1",
  green: "#22C55E",
  yellow: "#EAB308",
  red: "#EF4444",
  orange: "#F97316",
}

const LOCALE_STORAGE_KEY = "bibak-locale"
const REVIEW_DATA_WARNING_CODES = ["low_review_count", "no_reviews", "limited_review_data"]

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored === "en" || stored === "tr" ? stored : "tr"
  } catch {
    return "tr"
  }
}

function getScoreColor(score: number) {
  if (score >= 75) return COLORS.green
  if (score >= 50) return COLORS.yellow
  if (score >= 30) return COLORS.orange
  return COLORS.red
}

function getScoreLabel(score: number, strings: Translations) {
  if (score >= 80) return strings.trusted
  if (score >= 60) return strings.caution
  if (score >= 40) return strings.risky
  return strings.dangerous
}

function ScoreRing({ score, strings, size = 130 }: { score: number; strings: Translations; size?: number }) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const [dashOffset, setDashOffset] = useState(339.292)
  const color = getScoreColor(score)
  const radius = 54
  const circumference = 2 * Math.PI * radius

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
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)", filter: `drop-shadow(0 0 8px ${color}80)` }}
        />
        <circle cx="60" cy="60" r={40} fill="none" stroke={color} strokeWidth="0.5" opacity="0.15" />
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1, fontFamily: "'Inter', -apple-system, sans-serif" }}>
          {animatedScore}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 2, marginTop: 4 }}>
          {getScoreLabel(score, strings)}
        </span>
      </div>
    </div>
  )
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const color = getScoreColor(value)
  const [width, setWidth] = useState(0)
  useEffect(() => { setTimeout(() => setWidth(value), 400) }, [value])

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${color}CC, ${color})`,
          width: `${width}%`, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: `0 0 8px ${color}40`,
        }} />
      </div>
    </div>
  )
}

function RiskFlag({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
      background: "rgba(239, 68, 68, 0.08)", borderRadius: 10,
      border: "1px solid rgba(239, 68, 68, 0.15)", marginBottom: 6,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <span style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 500, lineHeight: 1.4 }}>{text}</span>
    </div>
  )
}

function ExplanationCard({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
      background: "rgba(99, 102, 241, 0.06)", borderRadius: 10,
      border: "1px solid rgba(99, 102, 241, 0.12)", marginBottom: 6,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💡</span>
      <span style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.4 }}>{text}</span>
    </div>
  )
}

function parsePriceText(price: string): { value: number | null; currency: string | null; raw: string } {
  const normalizedText = price.replace(/\u00a0/g, " ")
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
  const match = (basketPriceMatches.at(-1) || productPriceMatches.at(-1))?.item
  if (!match) return { value: null, currency: null, raw: price }

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
    raw: price
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

function InsightPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "0 16px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{
        background: "rgba(255,255,255,0.035)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: "10px 12px"
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
  const averagePrice = price?.observed_average ?? null
  const currentPrice = price?.current_price ?? null
  const currentColor = averagePrice != null && currentPrice != null
    ? currentPrice < averagePrice
      ? COLORS.green
      : currentPrice > averagePrice
        ? COLORS.orange
        : COLORS.text
    : COLORS.text
  const analysisText = price?.explanation || timing?.reason

  return (
    <InsightPanel title={locale === "tr" ? "Fiyat & Zamanlama" : "Price & Timing"}>
      {price && (
        <>
          <MiniStat label={locale === "tr" ? "Geçmiş" : "History"} value={price.history_count} />
          <MiniStat label={locale === "tr" ? "En düşük" : "Low"} value={formatMoney(price.observed_low, price.currency)} />
          <MiniStat label={locale === "tr" ? "En yüksek" : "High"} value={formatMoney(price.observed_high, price.currency)} />
          <MiniStat label={locale === "tr" ? "Ortalama" : "Average"} value={formatMoney(averagePrice, price.currency)} />
          <MiniStat label={locale === "tr" ? "Güncel" : "Current"} value={formatMoney(currentPrice, price.currency)} valueColor={currentColor} />
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

function LowReviewNotice({ data, scrapedData, locale }: { data: AnalysisData; scrapedData: ScrapedProduct | null; locale: Locale }) {
  const warnings = new Set([...(scrapedData?.metadata?.warnings || []), ...(data.warnings || [])])
  const reviewCount = scrapedData?.metadata?.reviewCount ?? scrapedData?.reviews.length ?? 0
  const show = REVIEW_DATA_WARNING_CODES.some((warning) => warnings.has(warning)) || reviewCount < 3
  if (!show) return null

  const message = locale === "tr"
    ? `Yorum sayısı düşük (${reviewCount}); sonuç daha temkinli okunmalı.`
    : `Low review sample (${reviewCount}); treat the result cautiously.`

  return (
    <div style={{
      margin: "0 16px 12px",
      padding: "9px 11px",
      background: "rgba(234, 179, 8, 0.08)",
      border: "1px solid rgba(234, 179, 8, 0.18)",
      borderRadius: 10,
      color: "#FDE68A",
      fontSize: 11,
      lineHeight: 1.4
    }}>
      {message}
    </div>
  )
}

function AlternativesPanel({ data, locale }: { data: AnalysisData; locale: Locale }) {
  if (!data.safer_alternatives.length) return null

  return (
    <InsightPanel title={locale === "tr" ? "Alternatifler" : "Alternatives"}>
      {data.safer_alternatives.slice(0, 3).map((item, index) => (
        <a
          key={`${item.url || item.title || index}`}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block", color: COLORS.text, textDecoration: "none",
            fontSize: 11, lineHeight: 1.35, marginTop: index ? 9 : 0
          }}
        >
          <strong>{item.title || (locale === "tr" ? "Alternatif ürün" : "Alternative product")}</strong>
          <span style={{ display: "block", color: COLORS.textDim, marginTop: 2 }}>
            {item.seller || "N/A"} · {formatMoney(item.price, item.currency)} · {item.trust_score || 0}/100
          </span>
        </a>
      ))}
    </InsightPanel>
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
      color: isFallback ? "#FDE68A" : COLORS.textDim,
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
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
        color: COLORS.textDim, cursor: "pointer", borderRadius: 6,
        padding: "3px 8px", fontSize: 10, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 4,
        transition: "background 0.2s", fontFamily: "'Inter', sans-serif",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
    >
      <span style={{ fontSize: 12 }}>🌐</span>
      {LOCALE_LABELS[next]}
    </button>
  )
}

const containerStyle: React.CSSProperties = {
  width: 320,
  maxHeight: "calc(100vh - 32px)",
  background: COLORS.bg,
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  borderRadius: 16,
  border: `1px solid ${COLORS.border}`,
  boxShadow: "0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
  const strings = t(locale)

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

      setLoading(true)
      try {
        const res = await analyzeProduct({
          title: scrapedData.title,
          price: scrapedData.price,
          seller: scrapedData.seller,
          reviews: scrapedData.reviews,
          rating: scrapedData.rating,
          locale,
          platform: scrapedData.platform,
          product_id: scrapedData.metadata?.productId,
          url: window.location.href,
          scrape_metadata: scrapedData.metadata,
          parsed_price: parsePriceText(scrapedData.price),
          external_price_history: scrapedData.priceHistory
        })
        setData(res)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [locale, scrapedData, scrapeError])

  if (scrapeError) {
    return (
      <div style={{
        ...containerStyle,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 200, gap: 16, padding: 20, textAlign: "center"
      }}>
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

  if (loading && !data) {
    return (
      <div style={{
        ...containerStyle,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 300, gap: 16,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          border: "3px solid rgba(99, 102, 241, 0.15)", borderTopColor: COLORS.accent,
          animation: "bibak-spin 0.8s linear infinite",
        }} />
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, textAlign: "center", margin: 0 }}>
            {strings.analyzing}
          </p>
          <p style={{ fontSize: 11, color: COLORS.textDim, textAlign: "center", margin: "4px 0 0" }}>
            {strings.analyzingSub}
          </p>
        </div>
        <style>{`@keyframes bibak-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!data) return null
  const scoreColor = getScoreColor(data.trust_score)

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          width: 52, height: 52, borderRadius: 14,
          background: COLORS.bg, backdropFilter: "blur(20px)",
          border: `1px solid ${COLORS.border}`,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "transform 0.2s", fontFamily: "'Inter', sans-serif",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{data.trust_score}</div>
          <div style={{ fontSize: 6, fontWeight: 600, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1 }}>
            {strings.score.toLowerCase()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{
        padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${COLORS.border}`,
        background: "linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
          }}>🛡️</div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>BiBak</span>
            <span style={{ fontSize: 9, color: COLORS.textDim, marginLeft: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>
              {strings.trustAnalysis}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LanguageToggle locale={locale} onChange={handleLocaleChange} />
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background: "rgba(255,255,255,0.05)", border: "none", color: COLORS.textDim,
              cursor: "pointer", borderRadius: 6, width: 26, height: 26,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          >✕</button>
        </div>
      </div>

      {/* Score Section */}
      <div style={{ 
        display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 16px",
        position: "relative" 
      }}>
        <ScoreRing score={data.trust_score} strings={strings} />
        {loading && (
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(15,17,23,0.4)", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 16, zIndex: 10
          }}>
            <div style={{ width: 20, height: 20, border: "2px solid #6366F1", borderTopColor: "transparent", borderRadius: "50%", animation: "bibak-spin 0.6s linear infinite" }} />
          </div>
        )}
      </div>

      {/* Metrics */}
      <div style={{ padding: "0 16px 16px" }}>
        <MetricBar label={strings.reviewAuthenticity} value={data.review_authenticity_score} />
        <MetricBar label={strings.priceIntegrity} value={data.price_integrity_score} />
        <MetricBar label={strings.sellerReliability} value={data.seller_reliability_score} />
      </div>

      <StatusNotice source={data.source} warnings={data.warnings} strings={strings} />

      <LowReviewNotice data={data} scrapedData={scrapedData} locale={locale} />
      <PriceTimingPanel data={data} locale={locale} />
      <AlternativesPanel data={data} locale={locale} />

      {/* Risk Flags */}
      {data.risk_flags.length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.red, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            ⚡ {strings.riskAlerts}
          </div>
          {data.risk_flags.map((flag, i) => <RiskFlag key={i} text={flag} />)}
        </div>
      )}

      {/* Explanations */}
      {data.explanations.length > 0 && (
        <div style={{ padding: "0 16px 12px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>
            {strings.analysis}
          </div>
          {data.explanations.map((exp, i) => <ExplanationCard key={i} text={exp} />)}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${COLORS.border}`, display: "flex", justifyContent: "center" }}>
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>{strings.poweredBy}</span>
      </div>
    </div>
  )
}
