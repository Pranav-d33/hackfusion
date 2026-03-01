/**
 * Prediction Timeline Component (Redesigned)
 * Visual, transparent medication depletion calendar with
 * consumption-learned data. Matches Mediloon white-glass UI.
 */
import React, { useState, useCallback } from 'react';
import {
  Calendar, Pill, ShoppingCart, TrendingUp,
  Clock, AlertTriangle, ChevronDown, ChevronUp,
  Activity, BarChart2, RefreshCw,
} from 'lucide-react';

export default function PredictionTimeline({ timeline, stats, onReorder, loading }) {
  const [expandedId, setExpandedId] = useState(null);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'list'
  const [hoveredPred, setHoveredPred] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleDotMouseEnter = useCallback((e, pred) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
    setHoveredPred(pred);
  }, []);
  const handleDotMouseLeave = useCallback(() => setHoveredPred(null), []);

  const getUrgencyConfig = (urgency) => {
    switch (urgency) {
      case 'critical':
        return {
          bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700',
          badge: 'bg-red-500 text-white', dot: 'bg-red-500',
          icon: <AlertTriangle size={14} className="text-red-500" />,
          glow: 'shadow-red-100',
        };
      case 'soon':
        return {
          bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700',
          badge: 'bg-amber-500 text-white', dot: 'bg-amber-500',
          icon: <Clock size={14} className="text-amber-500" />,
          glow: 'shadow-amber-100',
        };
      default:
        return {
          bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700',
          badge: 'bg-emerald-500 text-white', dot: 'bg-emerald-500',
          icon: <Calendar size={14} className="text-emerald-500" />,
          glow: 'shadow-emerald-100',
        };
    }
  };

  const getDaysLabel = (days) => {
    if (days <= 0) return 'Depleted';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const getTimelinePercent = (days) => {
    const max = 30;
    return Math.min(Math.max(days, 0), max) / max * 100;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <RefreshCw size={24} className="mx-auto text-gray-300 animate-spin mb-3" />
        <p className="text-gray-400 text-sm">Loading your medication timeline…</p>
      </div>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
        <Calendar size={32} className="mx-auto text-gray-200 mb-3" />
        <p className="text-gray-500 font-medium">No medication timeline yet</p>
        <p className="text-gray-400 text-sm mt-1">Order medications to see your refill predictions here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Tracked', value: stats.total_medications, icon: <Pill size={16} />, color: 'text-red-500 bg-red-50' },
            { label: 'Regular', value: stats.regular_medications, icon: <RefreshCw size={16} />, color: 'text-blue-500 bg-blue-50' },
            { label: 'Upcoming', value: stats.upcoming_refills, icon: <Clock size={16} />, color: 'text-amber-500 bg-amber-50' },
            { label: 'Adherence', value: `${stats.avg_adherence}%`, icon: <Activity size={16} />, color: 'text-emerald-500 bg-emerald-50' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3 shadow-sm">
              <div className={`p-2 rounded-lg ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-lg font-bold text-gray-900 leading-tight">{s.value}</p>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header + View Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <Calendar size={18} className="text-red-500" />
          Medication Timeline
        </h3>
        <div className="flex bg-gray-100 rounded-full p-0.5">
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${viewMode === 'timeline' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
          >
            Cards
          </button>
        </div>
      </div>

      {/* ===== Timeline View ===== */}
      {viewMode === 'timeline' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          {/* Fixed-position tooltip portal */}
          {hoveredPred && (() => {
            const cfg = getUrgencyConfig(hoveredPred.urgency);
            const TOOLTIP_W = 230;
            const TOOLTIP_H = 165;
            let tx = tooltipPos.x - TOOLTIP_W / 2;
            let ty = tooltipPos.y - TOOLTIP_H - 12;
            tx = Math.max(8, Math.min(tx, window.innerWidth - TOOLTIP_W - 8));
            ty = Math.max(8, ty);
            return (
              <div
                style={{ position: 'fixed', left: tx, top: ty, width: TOOLTIP_W, zIndex: 9999, pointerEvents: 'none' }}
                className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4"
              >
                <p className="font-bold text-gray-900 text-base">{hoveredPred.brand_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{hoveredPred.dosage}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.badge}`}>{getDaysLabel(hoveredPred.days_until_depletion)}</span>
                </div>
                {hoveredPred.frequency_label && (
                  <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                    <TrendingUp size={11} /> {hoveredPred.frequency_label} buyer
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <ShoppingCart size={11} /> Click dot to reorder
                </p>
                {/* Arrow */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45" />
              </div>
            );
          })()}

          {/* Scale */}
          <div className="flex justify-between text-xs text-gray-400 px-1 uppercase tracking-widest">
            <span>Today</span><span>1 wk</span><span>2 wk</span><span>3 wk</span><span>4 wk</span>
          </div>

          {/* Track */}
          <div className="relative h-14 rounded-xl bg-gradient-to-r from-red-50 via-amber-50 to-emerald-50 border border-gray-100">
            {/* Zone markers */}
            <div className="absolute inset-y-0 left-0 w-[10%] bg-red-100/60 rounded-l-xl" />
            <div className="absolute inset-y-0 left-[10%] w-[15%] bg-amber-100/40" />

            {/* Dots */}
            {timeline.map((pred, i) => {
              const cfg = getUrgencyConfig(pred.urgency);
              const left = getTimelinePercent(pred.days_until_depletion);
              return (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${left}%`, zIndex: 20 }}
                  onMouseEnter={(e) => handleDotMouseEnter(e, pred)}
                  onMouseLeave={handleDotMouseLeave}
                  onClick={() => onReorder?.(pred)}
                >
                  <div className={`w-8 h-8 rounded-full ${cfg.dot} flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-125 border-2 border-white`}>
                    <Pill size={14} className="text-white" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-5 text-xs text-gray-500">
            {[
              { color: 'bg-red-500', label: 'Critical (0-3d)' },
              { color: 'bg-amber-500', label: 'Soon (4-7d)' },
              { color: 'bg-emerald-500', label: 'Upcoming (8+d)' },
            ].map((l, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />{l.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ===== Card View ===== */}
      <div className="space-y-3">
        {(viewMode === 'list' ? timeline : timeline.filter(t => t.urgency === 'critical' || t.urgency === 'soon')).map((pred, i) => {
          const cfg = getUrgencyConfig(pred.urgency);
          const isExpanded = expandedId === i;

          return (
            <div
              key={i}
              className={`rounded-xl border ${cfg.border} ${cfg.bg} shadow-sm ${cfg.glow} overflow-hidden transition-all duration-200 hover:shadow-md`}
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : i)}
              >
                <div className={`w-10 h-10 rounded-xl ${cfg.dot} flex items-center justify-center shadow-sm`}>
                  <Pill size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{pred.brand_name}</p>
                  <p className="text-[11px] text-gray-500">{pred.dosage} • {pred.generic_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${cfg.badge}`}>
                    {getDaysLabel(pred.days_until_depletion)}
                  </span>
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 space-y-3 animate-fade-in-up">
                  {/* Progress bar: depletion */}
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>Supply remaining</span>
                      <span>{pred.depletion_date}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pred.urgency === 'critical' ? 'bg-red-500' : pred.urgency === 'soon' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.max(5, Math.min(100, (pred.days_until_depletion / 30) * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* AI-learned insights */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/80 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{pred.order_count || '—'}</p>
                      <p className="text-[10px] text-gray-400">Orders</p>
                    </div>
                    <div className="bg-white/80 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{pred.frequency_label || '—'}</p>
                      <p className="text-[10px] text-gray-400">Frequency</p>
                    </div>
                    <div className="bg-white/80 rounded-lg p-2">
                      <p className="text-xs font-bold text-gray-800">{pred.adherence_score || 0}%</p>
                      <p className="text-[10px] text-gray-400">Adherence</p>
                    </div>
                  </div>

                  {pred.next_predicted_order && (
                    <p className="text-[11px] text-gray-500 flex items-center gap-1.5 bg-white/60 rounded-lg px-3 py-2">
                      <TrendingUp size={12} className="text-blue-500" />
                      <span>Predicted next order: <strong className="text-gray-700">{pred.next_predicted_order}</strong></span>
                    </p>
                  )}

                  <button
                    onClick={() => onReorder?.(pred)}
                    className="w-full text-sm bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <ShoppingCart size={15} /> Quick Reorder
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show-all hint in timeline mode */}
      {viewMode === 'timeline' && timeline.filter(t => t.urgency !== 'critical' && t.urgency !== 'soon').length > 0 && (
        <button
          onClick={() => setViewMode('list')}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1.5 mx-auto"
        >
          <BarChart2 size={12} /> View all {timeline.length} medications
        </button>
      )}
    </div>
  );
}
