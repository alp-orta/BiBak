import React from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react'

export const TrustSidebar = ({ data, loading }: { data: any, loading: boolean }) => {
  if (loading) {
    return (
      <div className="w-80 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl p-6 border border-gray-100 flex flex-col items-center justify-center min-h-[300px]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"
        />
        <p className="text-gray-500 font-medium">Analyzing product...</p>
      </div>
    )
  }

  if (!data) return null;

  const scoreColor = data.trust_score > 70 ? 'text-green-500' : data.trust_score > 40 ? 'text-yellow-500' : 'text-red-500'

  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-gray-100 font-sans"
    >
      <div className="p-6 bg-gradient-to-b from-blue-50/50 to-transparent">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="text-blue-600 w-6 h-6" />
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">BiBak</h2>
        </div>

        <div className="flex flex-col items-center mb-6">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="64" cy="64" r="60" className="text-gray-100" strokeWidth="8" stroke="currentColor" fill="transparent" />
              <motion.circle 
                initial={{ strokeDasharray: "0, 400" }}
                animate={{ strokeDasharray: `${(data.trust_score / 100) * 377}, 400` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                cx="64" cy="64" r="60" className={scoreColor} strokeWidth="8" stroke="currentColor" fill="transparent" strokeLinecap="round" 
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={`text-4xl font-black ${scoreColor}`}>{data.trust_score}</span>
              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Score</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {data.risk_flags?.map((flag: string, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-red-50 text-red-700 rounded-xl">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{flag}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
