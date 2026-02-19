/**
 * PredictionTimeline — Transparent AI Prediction Visualization
 * 
 * TWO MODES:
 *  showcase={true}  → Compact horizontal strip for center column (always visible, demo data fallback)
 *  showcase={false}  → Full sidebar panel (original)
 */
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

/* ── Icons ── */
const Icons = {
  expand: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7" /></svg>,
  close: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
  brain: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 14.5M14.25 3.104c.251.023.501.05.75.082M19.8 14.5a2.25 2.25 0 00.447-1.342L21 3.75m-1.2 10.75L15 19.5m4.8-5H19m-9.3 5l-4.8-5H4.5" /></svg>,
  trend: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2 20l5.5-5.5m0 0l3 3L22 6" /></svg>,
  info: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" /></svg>,
  clock: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
};

/* ── Demo data for showcase when no real data ── */
const DEMO_PREDICTIONS = [
  { brand_name: 'Paracetamol 500mg', days_until_depletion: 2, current_stock: 6, units_per_day: 3, confidence: 0.92 },
  { brand_name: 'Amoxicillin 250mg', days_until_depletion: 5, current_stock: 15, units_per_day: 3, confidence: 0.85 },
  { brand_name: 'Cetirizine 10mg', days_until_depletion: 12, current_stock: 24, units_per_day: 2, confidence: 0.78 },
  { brand_name: 'Omeprazole 20mg', days_until_depletion: 18, current_stock: 36, units_per_day: 2, confidence: 0.88 },
];

function daysFromNow(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : Math.ceil((d - new Date()) / 86400000);
}

function getUrgency(days) {
  if (days == null) return { label: '—', color: '#9CA3AF', bg: 'bg-gray-100', dot: 'bg-gray-300', bar: 'bg-gray-300', ring: '#D1D5DB' };
  if (days <= 0) return { label: 'EMPTY', color: '#DC2626', bg: 'bg-mediloon-50', dot: 'bg-mediloon-500 animate-pulse', bar: 'bg-mediloon-500', ring: '#DC2626' };
  if (days <= 3) return { label: 'CRITICAL', color: '#DC2626', bg: 'bg-mediloon-50', dot: 'bg-mediloon-500 animate-pulse', bar: 'bg-mediloon-500', ring: '#DC2626' };
  if (days <= 7) return { label: 'SOON', color: '#F59E0B', bg: 'bg-amber-50', dot: 'bg-amber-500', bar: 'bg-amber-400', ring: '#F59E0B' };
  return { label: 'OK', color: '#10B981', bg: 'bg-emerald-50', dot: 'bg-emerald-500', bar: 'bg-emerald-400', ring: '#10B981' };
}

/* ── SVG Progress Ring ── */
function ProgressRing({ pct, size = 48, strokeWidth = 4, color = '#DC2626', children }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/* ── Mini Sparkline ── */
function Sparkline({ data, width = 64, height = 20, color = '#DC2626' }) {
  if (!data || data.length < 2) return <div className="rounded animate-pulse" style={{ width, height, background: '#F9FAFB' }} />;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * (height - 3)}`).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <circle cx={width} cy={height - (data[data.length - 1] / max) * (height - 3)} r="2" fill={color} />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   SHOWCASE MODE — Compact horizontal strip
   Always visible at top of center column
   ───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   SHOWCASE MODE — Simplified, Aesthetic Status Cards
   Clean, easy-to-read "days left" focus with actionable buttons
   ───────────────────────────────────────────── */
function ShowcaseStrip({ predictions, onReorder, onExpand, isDemo }) {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-mediloon-500 to-mediloon-600 rounded-lg flex items-center justify-center shadow-lg shadow-mediloon-200">
            <Icons.brain className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="font-brand font-bold text-sm text-ink-primary tracking-tight">Refill Predictions</h3>
          {isDemo && <span className="text-[9px] px-1.5 py-0.5 bg-mediloon-50 text-mediloon-600 font-bold rounded-md border border-mediloon-100 tracking-wide">DEMO</span>}
        </div>
        <button onClick={onExpand} className="text-[11px] font-brand font-bold text-mediloon-600 hover:text-mediloon-700 transition-colors flex items-center gap-1 group">
          View All <Icons.expand className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Horizontal Scrollable Cards */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-hide snap-x">
        {predictions.map((pred, i) => {
          const days = pred.days_until_depletion ?? daysFromNow(pred.depletion_date);
          const urg = getUrgency(days);
          const maxDays = 30;
          const pct = Math.max(0, Math.min(100, ((Math.max(0, days || 0)) / maxDays) * 100)); // Percentage of time LEFT

          return (
            <div key={i} className="flex-none w-[140px] snap-center group relative">
              <div className="absolute inset-0 bg-white rounded-2xl shadow-sm border border-gray-100 transition-all duration-300 group-hover:shadow-md group-hover:border-mediloon-100 group-hover:-translate-y-1" />

              <div className="relative p-3.5 flex flex-col h-full rounded-2xl overflow-hidden">
                {/* Status Bar Top */}
                <div className={`absolute top-0 left-0 w-full h-1 ${urg.bar}`} />

                {/* Header */}
                <div className="mb-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${urg.bg}`} style={{ color: urg.color }}>
                      {urg.label}
                    </span>
                    {days <= 3 && (
                      <div className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${urg.bg}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${urg.dot.split(' ')[0]}`}></span>
                      </div>
                    )}
                  </div>
                  <h4 className="font-brand font-bold text-xs text-gray-900 truncate" title={pred.brand_name}>{pred.brand_name}</h4>
                  <p className="text-[10px] text-gray-400 truncate">{pred.current_stock ?? 0} units left</p>
                </div>

                {/* Big Number */}
                <div className="flex items-baseline gap-1 mt-auto">
                  <span className="text-2xl font-brand font-extrabold text-gray-900 leading-none">
                    {days == null ? '—' : (days <= 0 ? '0' : days)}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500">days</span>
                </div>

                {/* Visual Bar (Fuel Gauge) */}
                <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 mb-1 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${urg.bar}`}
                    style={{ width: `${Math.min(100, (days / 30) * 100)}%` }}
                  />
                </div>

                {/* Action Button (shows on hover or if critical) */}
                {days <= 5 ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onReorder?.(pred); }}
                    className={`mt-2 w-full py-1.5 rounded-lg text-[10px] font-bold text-white transition-all active:scale-95 shadow-sm
                        ${days <= 3 ? 'bg-mediloon-500 hover:bg-mediloon-600 animate-pulse-subtle' : 'bg-amber-400 hover:bg-amber-500 text-white'}`}
                  >
                    Reorder
                  </button>
                ) : (
                  <div className="h-[26px]" /> /* Spacer */
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   DETAIL CARD — Expanded per-medicine view
   ───────────────────────────────────────────── */
/* ─────────────────────────────────────────────
   DETAIL CARD — Expanded per-medicine view
   Matches ShowcaseStrip aesthetic but with more detail
   ───────────────────────────────────────────── */
function DetailCard({ pred, consumption, recentOrders, onReorder }) {
  const days = pred.days_until_depletion ?? daysFromNow(pred.depletion_date);
  const urg = getUrgency(days);
  const maxDays = 30;

  // Stats
  const medConsumption = consumption?.find(c => c.brand_name === pred.brand_name || c.product_name === pred.brand_name);
  const medOrders = recentOrders?.filter(o => o.brand_name === pred.brand_name || o.product_name === pred.brand_name) || [];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md hover:border-mediloon-100 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-brand font-bold text-sm text-gray-900">{pred.brand_name}</h4>
          <p className="text-[10px] text-gray-400">
            {pred.current_stock ?? 0} units · {pred.units_per_day || '—'}/day
          </p>
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${urg.bg}`} style={{ color: urg.color }}>
          {urg.label}
        </span>
      </div>

      {/* Countdown & Bar */}
      <div className="flex items-end gap-3 mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-brand font-extrabold text-gray-900 leading-none">
            {days == null ? '—' : (days <= 0 ? '0' : days)}
          </span>
          <span className="text-[10px] font-semibold text-gray-500">days</span>
        </div>
        <div className="flex-1 pb-1">
          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${urg.bar}`}
              style={{ width: `${Math.min(100, (days / 30) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-2 gap-1">
          <div className="px-2 py-1 bg-gray-50 rounded text-[9px] text-gray-500 font-medium text-center border border-gray-100">
            {medOrders.length} Orders
          </div>
          <div className="px-2 py-1 bg-gray-50 rounded text-[9px] text-gray-500 font-medium text-center border border-gray-100">
            {(pred.confidence * 100).toFixed(0)}% Conf.
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onReorder?.(pred); }}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold text-white transition-all active:scale-95 shadow-sm whitespace-nowrap
            ${days <= 5 ? 'bg-mediloon-500 hover:bg-mediloon-600' : 'bg-gray-800 hover:bg-gray-900'}`}
        >
          {days <= 5 ? 'Reorder Now' : 'Reorder'}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */
export default function PredictionTimeline({ timeline, consumption, recentOrders, loading, onReorder, showcase = false }) {
  const [zoomed, setZoomed] = useState(false);

  const sorted = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    return [...timeline].sort((a, b) => {
      const dA = a.days_until_depletion ?? daysFromNow(a.depletion_date) ?? 999;
      const dB = b.days_until_depletion ?? daysFromNow(b.depletion_date) ?? 999;
      return dA - dB;
    });
  }, [timeline]);

  const isDemo = sorted.length === 0;
  const predictions = isDemo ? DEMO_PREDICTIONS : sorted;

  const stats = useMemo(() => {
    const src = predictions;
    const critical = src.filter(p => (p.days_until_depletion ?? daysFromNow(p.depletion_date)) <= 3).length;
    const soon = src.filter(p => { const d = p.days_until_depletion ?? daysFromNow(p.depletion_date); return d > 3 && d <= 7; }).length;
    return { total: src.length, critical, soon };
  }, [predictions]);

  if (loading) {
    return (
      <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-glass p-4 flex items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-mediloon-200 border-t-mediloon-500 rounded-full animate-spin" />
        <p className="text-xs font-brand text-ink-faint">Analyzing patterns...</p>
      </div>
    );
  }

  /* ── SHOWCASE MODE ── */
  if (showcase) {
    return (
      <>
        <ShowcaseStrip predictions={predictions} onReorder={onReorder} onExpand={() => setZoomed(true)} isDemo={isDemo} />

        {/* Expanded modal */}
        {zoomed && createPortal(
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in" onClick={() => setZoomed(false)}>
            <div className="w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl shadow-glass-lg border border-surface-fog flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-fog bg-gradient-to-r from-mediloon-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-2xl flex items-center justify-center shadow-md shadow-mediloon-200">
                    <Icons.brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-brand font-extrabold text-ink-primary">AI Prediction Transparency</h2>
                    <p className="text-[11px] text-ink-faint">{stats.total} predictions · {stats.critical} critical · {stats.soon} upcoming</p>
                  </div>
                </div>
                <button onClick={() => setZoomed(false)} className="p-2 text-ink-faint hover:text-ink-primary hover:bg-surface-cloud rounded-xl transition-all">
                  <Icons.close className="w-5 h-5" />
                </button>
              </div>

              {/* Legend */}
              <div className="px-6 py-2 border-b border-surface-fog/50 flex items-center gap-4 text-[10px] text-ink-faint font-brand bg-surface-snow">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-mediloon-500" /> Critical ≤3d</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Soon ≤7d</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> OK 7d+</span>
                <span className="ml-auto flex items-center gap-1"><Icons.brain className="w-3 h-3" /> Ring = urgency</span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {predictions.map((pred, i) => (
                  <DetailCard key={i} pred={pred} consumption={consumption} recentOrders={recentOrders} onReorder={onReorder} />
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  /* ── FULL PANEL MODE (sidebar) ── */
  return (
    <>
      <div className="flex flex-col h-full overflow-hidden rounded-2xl border border-white/60 bg-surface-snow/80 backdrop-blur-xl shadow-glass hover:shadow-lift-lg transition-all duration-300">
        <div className="px-4 py-3 border-b border-gray-100 bg-white/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-brand font-bold text-ink-primary flex items-center gap-2 text-sm">
              <div className="w-7 h-7 bg-mediloon-100 text-mediloon-600 rounded-lg flex items-center justify-center shadow-sm">
                <Icons.brain className="w-4 h-4" />
              </div>
              Predictions
            </h3>
            {/* Legend */}
            <div className="flex items-center gap-2 text-[8px] font-bold text-gray-400 uppercase tracking-wider">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-mediloon-500"></span>Crit</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Low</span>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-3 scrollbar-hide">
          {predictions.map((pred, i) => (
            <DetailCard key={i} pred={pred} consumption={consumption} recentOrders={recentOrders} onReorder={onReorder} />
          ))}
        </div>
      </div>
    </>
  );
}
