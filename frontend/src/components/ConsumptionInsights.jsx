/**
 * Consumption Insights Component
 * Visualises medicine consumption frequency learned from order history.
 * Shows frequency rings, adherence bars, and predicted next-order dates.
 */
import React, { useState } from 'react';
import {
  BarChart2, TrendingUp, Repeat, Activity,
  ChevronDown, ChevronUp, Package, Calendar,
  ShoppingCart, Zap, Clock,
} from 'lucide-react';

const frequencyColors = {
  'Weekly': { ring: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
  'Bi-weekly': { ring: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  'Monthly': { ring: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  'Bi-monthly': { ring: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  'Quarterly': { ring: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  'Occasional': { ring: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-200' },
  'One-time': { ring: 'text-gray-300', bg: 'bg-gray-50', border: 'border-gray-100' },
};

function AdherenceRing({ score, size = 48 }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#f3f4f6" strokeWidth="4" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth="4" fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="fill-gray-800 font-bold transform rotate-90 origin-center"
        style={{ fontSize: size * 0.28, transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {score}%
      </text>
    </svg>
  );
}

function FrequencyBar({ label, value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-gray-500 w-20 text-right">{label}</span>
      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-400 to-rose-500 transition-all duration-700"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8">{value}</span>
    </div>
  );
}

export default function ConsumptionInsights({ consumption, onReorder, loading }) {
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState('frequency'); // 'frequency' | 'adherence' | 'orders'

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
        <Activity size={24} className="mx-auto text-gray-300 animate-pulse mb-3" />
        <p className="text-gray-400 text-sm">Analysing your consumption patterns…</p>
      </div>
    );
  }

  if (!consumption || consumption.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
        <BarChart2 size={32} className="mx-auto text-gray-200 mb-3" />
        <p className="text-gray-500 font-medium">No consumption data yet</p>
        <p className="text-gray-400 text-sm mt-1">Place orders to see frequency insights.</p>
      </div>
    );
  }

  // Frequency distribution
  const freqDist = {};
  consumption.forEach(c => {
    freqDist[c.frequency_label] = (freqDist[c.frequency_label] || 0) + 1;
  });
  const maxFreq = Math.max(...Object.values(freqDist), 1);

  // Sort
  const sorted = [...consumption].sort((a, b) => {
    if (sortBy === 'adherence') return b.adherence_score - a.adherence_score;
    if (sortBy === 'orders') return b.order_count - a.order_count;
    return (a.avg_interval_days || 999) - (b.avg_interval_days || 999);
  });

  return (
    <div className="space-y-5">
      {/* Frequency Distribution */}
      <div className="bg-white rounded-2xl shadow-soft p-5">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4">
          <BarChart2 size={16} className="text-red-500" />
          Purchase Frequency Distribution
        </h4>
        <div className="space-y-2.5">
          {Object.entries(freqDist)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => (
              <FrequencyBar key={label} label={label} value={count} max={maxFreq} />
            ))}
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <TrendingUp size={16} className="text-red-500" />
          Medicine Consumption Details
        </h4>
        <div className="flex bg-gray-100 rounded-full p-0.5">
          {[
            { key: 'frequency', label: 'Frequency' },
            { key: 'adherence', label: 'Adherence' },
            { key: 'orders', label: 'Orders' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${sortBy === s.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Medicine Cards */}
      <div className="space-y-2.5">
        {sorted.map((med, i) => {
          const colors = frequencyColors[med.frequency_label] || frequencyColors['One-time'];
          const isExpanded = expandedId === med.product_id;

          return (
            <div
              key={med.product_id}
              className={`rounded-xl border ${colors.border} bg-white shadow-soft hover:shadow-soft-hover overflow-hidden transition-all duration-300`}
            >
              <div
                className="flex items-center gap-3 p-3.5 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : med.product_id)}
              >
                {/* Adherence Ring */}
                <AdherenceRing score={med.adherence_score} size={44} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{med.product_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${colors.bg} ${colors.ring}`}>
                      {med.frequency_label}
                    </span>
                    <span className="text-[10px] text-gray-400">{med.order_count} order{med.order_count > 1 ? 's' : ''}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {med.avg_interval_days && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Repeat size={11} /> ~{Math.round(med.avg_interval_days)}d
                    </span>
                  )}
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 animate-fade-in-up space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{med.total_quantity}</p>
                      <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><Package size={9} /> Total units</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{med.daily_dose}/day</p>
                      <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><Zap size={9} /> Dosage</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{med.monthly_rate}</p>
                      <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><TrendingUp size={9} /> Monthly</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{med.daily_rate}</p>
                      <p className="text-[10px] text-gray-400 flex items-center justify-center gap-1"><Activity size={9} /> Daily rate</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="text-[11px] text-gray-500">
                      <p className="flex items-center gap-1"><Calendar size={11} /> First: {med.first_order || '—'}</p>
                      <p className="flex items-center gap-1 mt-0.5"><Clock size={11} /> Last: {med.last_order || '—'}</p>
                    </div>
                    {med.next_predicted_order && (
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400">Next predicted</p>
                        <p className="text-xs font-bold text-red-500">{med.next_predicted_order}</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onReorder?.({ brand_name: med.product_name, medication_id: med.product_id })}
                    className="w-full text-sm bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <ShoppingCart size={15} /> Reorder Now
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
