/**
 * My Orders & Refills Modal
 * Full-width stacked layout:
 *   - Top: Prediction Timeline (needs full width for the 30-day horizontal track)
 *   - Bottom: Active + Past orders (scrollable list)
 * Tooltip-safe: timeline section uses overflow-visible so hover cards render.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  History, X, Pill, Calendar, Clock,
  Package, ChevronDown, ChevronUp, ShoppingBag,
  Maximize2, Activity, TrendingUp,
  AlertTriangle, ShoppingCart, RefreshCw, BarChart2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

/* ── helpers ── */
function formatDate(dateStr, locale = 'en-US') {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

/* ── urgency config ── */
const urgencyConfig = {
  critical: {
    bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700',
    badge: 'bg-red-500 text-white', dot: 'bg-red-500',
    icon: <AlertTriangle size={13} className="text-red-500" />,
  },
  soon: {
    bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700',
    badge: 'bg-amber-500 text-white', dot: 'bg-amber-500',
    icon: <Clock size={13} className="text-amber-500" />,
  },
  upcoming: {
    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700',
    badge: 'bg-emerald-500 text-white', dot: 'bg-emerald-500',
    icon: <Calendar size={13} className="text-emerald-500" />,
  },
};
const getUrgency = (u) => urgencyConfig[u] || urgencyConfig.upcoming;
const getDaysLabel = (d, t) => d <= 0 ? t('depleted') : d === 1 ? t('tomorrow') : `${d} ${t('days')}`;
const pct = (days) => Math.min(Math.max(days, 0), 30) / 30 * 100;


export default function PastOrdersModal({ orders, activeOrders, timeline, stats, consumption, loading, onReorder, externalOpen, onExternalClose, isVoiceMode, modalEpoch }) {
  const { t, bcp47 } = useLanguage();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen || internalOpen;
  const handleClose = () => {
    setInternalOpen(false);
    onExternalClose?.();
  };
  const [expandedDate, setExpandedDate] = useState(null);
  const [expandedActiveOrder, setExpandedActiveOrder] = useState(null);
  const [hoveredPred, setHoveredPred] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleDotMouseEnter = useCallback((e, pred) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
    setHoveredPred(pred);
  }, []);
  const handleDotMouseLeave = useCallback(() => setHoveredPred(null), []);

  useEffect(() => {
    setInternalOpen(false);
    setExpandedDate(null);
    setExpandedActiveOrder(null);
  }, [modalEpoch]);

  /* group past orders */
  const grouped = {};
  (orders || []).forEach(o => {
    const date = (o.purchase_date || '').slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(o);
  });
  const groupedEntries = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  const orderCount = orders?.length || 0;
  const activeCount = activeOrders?.length || 0;
  const timelineCount = timeline?.length || 0;

  return (
    <>
      {/* ── Trigger Button ── */}
      <button
        onClick={() => setInternalOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-black/[0.04] shadow-sm hover:shadow-apple hover:border-black/[0.08] transition-all duration-200 group"
      >
        <div className="p-2 bg-surface-fog group-hover:bg-surface-snow rounded-xl transition-colors">
          <ShoppingBag size={18} className="text-mediloon-600" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-[15px] font-brand font-bold text-ink-primary">{t('myOrdersRefills')}</p>
          <p className="text-xs font-body text-ink-secondary truncate">
            {loading ? t('loadingText') : [
              activeCount > 0 && `${activeCount} ${t('active').toLowerCase()}`,
              orderCount > 0 && `${orderCount} ${t('pastOrders').toLowerCase()}`,
              timelineCount > 0 && `${timelineCount} ${t('tracked')}`,
            ].filter(Boolean).join(' · ') || t('noOrdersYet')}
          </p>
        </div>
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{activeCount}</span>
        )}
        <Maximize2 size={14} className="text-gray-300 group-hover:text-red-400 transition-colors" />
      </button>

      {/* ── Modal ── */}
      {isOpen && createPortal(
        <div className={`fixed inset-0 z-[200] flex items-center ${isVoiceMode ? 'justify-end p-4 pr-6 bg-black/20 backdrop-blur-sm' : 'justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm'}`} onClick={handleClose}>
          <div
            className={`w-full ${isVoiceMode ? 'max-w-md animate-slide-in-right h-[calc(100vh-2rem)] my-4' : 'max-w-[1000px] animate-slide-up-spring h-[90vh] sm:max-h-[85vh]'} bg-white rounded-[2rem] shadow-apple-2xl border border-black/[0.04] flex flex-col`}
            onClick={e => e.stopPropagation()}
          >

            {/* ═══ Header ═══ */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.04] bg-white/95 backdrop-blur-xl z-10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-mediloon-500 to-mediloon-700 rounded-xl flex items-center justify-center shadow-md">
                  <Activity size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-[22px] font-brand font-bold text-ink-primary tracking-[-0.01em]">{t('myOrdersRefills')}</h2>
                  <p className="text-[13px] font-body text-ink-secondary mt-0.5">
                    {activeCount > 0 ? `${activeCount} ${t('active').toLowerCase()} · ` : ''}{orderCount} {t('pastOrders').toLowerCase()} · {timelineCount} {t('tracked')}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 bg-surface-snow hover:bg-surface-fog text-ink-secondary rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* ═══ Scrollable Body ═══ */}
            <div className="flex-1 overflow-y-auto bg-surface-snow/30">

              {/* ─── Section 1: Prediction Timeline (full width) ─── */}
              <div className="px-6 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={18} className="text-mediloon-500" />
                  <h3 className="text-base font-brand font-bold uppercase tracking-wider text-ink-secondary">{t('refillPredictions')}</h3>
                  <span className="text-[13px] font-body text-ink-muted ml-1">{t('aiMedicationTimeline')}</span>
                </div>

                {/* Timeline Track — overflow visible for tooltips */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw size={20} className="text-ink-ghost animate-spin" />
                  </div>
                ) : !timeline || timeline.length === 0 ? (
                  <div className="text-center py-6 bg-surface-snow rounded-2xl border border-black/[0.04]">
                    <Calendar size={28} className="mx-auto text-ink-ghost mb-2" />
                    <p className="text-[13px] font-brand font-semibold text-ink-secondary">{t('noMedicationTimeline')}</p>
                    <p className="text-[11px] font-body text-ink-muted mt-0.5">{t('orderMedicationsToSeePredictions')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Fixed-position tooltip rendered outside scroll container */}
                    {hoveredPred && (() => {
                      const cfg = getUrgency(hoveredPred.urgency);
                      const TOOLTIP_W = 240;
                      const TOOLTIP_H = 170;
                      let tx = tooltipPos.x - TOOLTIP_W / 2;
                      let ty = tooltipPos.y - TOOLTIP_H - 12;
                      // clamp to viewport
                      tx = Math.max(8, Math.min(tx, window.innerWidth - TOOLTIP_W - 8));
                      ty = Math.max(8, ty);
                      return (
                        <div
                          style={{ position: 'fixed', left: tx, top: ty, width: TOOLTIP_W, zIndex: 9999, pointerEvents: 'none' }}
                          className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4"
                        >
                          <p className="font-bold text-gray-900 text-base">{hoveredPred.brand_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{hoveredPred.dosage}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.badge}`}>{getDaysLabel(hoveredPred.days_until_depletion, t)}</span>
                            {hoveredPred.frequency_label && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <TrendingUp size={12} /> {hoveredPred.frequency_label}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                            <ShoppingCart size={11} /> {t('reorder')} in cart to order
                          </p>
                          {/* Arrow */}
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45" />
                        </div>
                      );
                    })()}
                    {/* Visual Track */}
                    <div className="relative pt-6 pb-2">
                      {/* Scale labels */}
                      <div className="absolute top-0 left-0 right-0 flex justify-between text-xs text-gray-400 px-2 uppercase tracking-widest font-medium">
                        <span>{t('today')}</span><span>1 wk</span><span>2 wk</span><span>3 wk</span><span>4 wk</span>
                      </div>

                      {/* Track bar */}
                      <div className="relative h-12 rounded-xl bg-gradient-to-r from-red-50 via-amber-50 to-emerald-50 border border-gray-100">
                        <div className="absolute inset-y-0 left-0 w-[10%] bg-red-100/50 rounded-l-xl" />
                        <div className="absolute inset-y-0 left-[10%] w-[15%] bg-amber-100/30" />

                        {/* Dots */}
                        {timeline.map((pred, i) => {
                          const cfg = getUrgency(pred.urgency);
                          const left = pct(pred.days_until_depletion);
                          return (
                            <div
                              key={i}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                              style={{ left: `${left}%`, zIndex: 20 }}
                              onMouseEnter={(e) => handleDotMouseEnter(e, pred)}
                              onMouseLeave={handleDotMouseLeave}
                              onClick={() => onReorder?.(pred)}
                            >
                              <div className={`w-9 h-9 rounded-full ${cfg.dot} flex items-center justify-center shadow-lg cursor-pointer transition-transform hover:scale-125 border-2 border-white`}>
                                <Pill size={14} className="text-white" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex justify-center gap-5 text-sm text-ink-secondary font-medium">
                      {[
                        { color: 'bg-red-500', label: t('criticalDays') },
                        { color: 'bg-amber-500', label: t('soonDays') },
                        { color: 'bg-emerald-500', label: t('upcomingDays') },
                      ].map((l, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />{l.label}
                        </span>
                      ))}
                    </div>

                    {/* Medication Cards (compact) */}
                    {timeline.filter(t => t.urgency === 'critical' || t.urgency === 'soon').length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {timeline.filter(t => t.urgency === 'critical' || t.urgency === 'soon').map((pred, i) => {
                          const cfg = getUrgency(pred.urgency);
                          return (
                            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                              <div className={`w-8 h-8 rounded-lg ${cfg.dot} flex items-center justify-center flex-shrink-0`}>
                                <Pill size={13} className="text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-brand font-semibold text-ink-primary truncate">{pred.brand_name}</p>
                                <p className="text-[13px] font-body text-ink-secondary">{pred.dosage}</p>
                              </div>
                              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${cfg.badge}`}>
                                {getDaysLabel(pred.days_until_depletion, t)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="mx-6 border-t border-black/[0.04]" />

              {/* ─── Section 2: Order History ─── */}
              <div className="px-6 pt-4 pb-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <History size={18} className="text-amber-500" />
                  <h3 className="text-base font-brand font-bold uppercase tracking-wider text-ink-secondary">{t('orderHistory')}</h3>
                </div>

                {/* Active Orders */}
                {activeCount > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-bold uppercase tracking-wider text-green-600 flex items-center gap-1.5 px-1 mb-1">
                      <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                      {t('active')} ({activeCount})
                    </p>
                    {activeOrders.map((order) => {
                      const isExp = expandedActiveOrder === order.order_id;
                      return (
                        <div key={order.id || order.order_id} className="bg-green-50/80 rounded-xl border border-green-100 overflow-hidden">
                          <button
                            onClick={() => setExpandedActiveOrder(isExp ? null : order.order_id)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-green-100/40 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Package size={16} className="text-green-600" />
                              <div className="text-left">
                                <p className="text-[15px] font-brand font-semibold text-ink-primary">Order #{order.order_id}</p>
                                <p className="text-[13px] font-body text-green-700">{order.status || t('confirmed')}{order.estimated_delivery ? ` · ${t('etaShort')} ${order.estimated_delivery}` : ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {order.total != null && <span className="text-[13px] font-bold text-ink-primary">€{Number(order.total).toFixed(2)}</span>}
                              {isExp ? <ChevronUp size={16} className="text-ink-ghost" /> : <ChevronDown size={16} className="text-ink-ghost" />}
                            </div>
                          </button>
                          {isExp && (
                            <div className="border-t border-green-100 divide-y divide-green-50">
                              {(order.items || []).map((item, i) => (
                                <div key={i} className="flex items-center gap-3 px-5 py-3">
                                  <Pill size={14} className="text-green-500 flex-shrink-0" />
                                  <span className="text-[14px] font-brand text-ink-primary flex-1 truncate font-medium">{item.brand_name}</span>
                                  <span className="text-[13px] font-body text-ink-secondary font-medium">×{item.quantity}</span>
                                  <button onClick={() => onReorder?.({ brand_name: item.brand_name })} className="text-[13px] font-brand text-red-500 font-semibold hover:text-red-700 bg-white/50 px-2.5 py-1.5 rounded-lg">{t('reorder')}</button>
                                </div>
                              ))}
                              {order.address && <p className="px-5 py-3 text-[13px] font-body text-ink-secondary border-t border-green-50/50">📍 {t('deliverTo')}: {order.address}</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Past Orders */}
                {activeCount > 0 && orderCount > 0 && (
                  <div className="flex items-center gap-3 px-1 py-1">
                    <div className="flex-1 h-px bg-black/[0.04]" />
                    <p className="text-xs font-brand font-bold uppercase tracking-wider text-ink-ghost">{t('pastOrders')}</p>
                    <div className="flex-1 h-px bg-black/[0.04]" />
                  </div>
                )}

                {loading ? (
                  <div className="py-8 text-center">
                    <RefreshCw size={20} className="mx-auto text-ink-ghost animate-spin mb-2" />
                    <p className="text-[13px] font-body text-ink-muted">{t('loadingHistory')}</p>
                  </div>
                ) : groupedEntries.length === 0 && activeCount === 0 ? (
                  <div className="py-8 text-center">
                    <ShoppingBag size={28} className="mx-auto text-ink-ghost mb-2" />
                    <p className="text-[14px] font-brand text-ink-secondary">{t('noOrdersYet')}</p>
                    <p className="text-[13px] font-body text-ink-muted mt-0.5">{t('yourOrderHistoryWillAppear')}</p>
                  </div>
                ) : groupedEntries.length === 0 ? null : (
                  groupedEntries.map(([date, items]) => {
                    const isExp = expandedDate === date;
                    return (
                      <div key={date} className="bg-white rounded-xl border border-black/[0.04] shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                        <button
                          onClick={() => setExpandedDate(isExp ? null : date)}
                          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-snow/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Calendar size={16} className="text-mediloon-400" />
                            <div className="text-left">
                              <p className="text-[15px] font-brand font-semibold text-ink-primary">{formatDate(date, bcp47 || 'en-US')}</p>
                              <p className="text-[13px] font-body text-ink-secondary font-medium">{items.length} {items.length > 1 ? t('items') : t('item')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden sm:flex gap-1.5">
                              {items.slice(0, 2).map((it, i) => (
                                <span key={i} className="text-[13px] font-body bg-surface-snow text-ink-primary px-2.5 py-0.5 rounded-full truncate max-w-[100px] font-medium">{it.brand_name}</span>
                              ))}
                            </div>
                            {isExp ? <ChevronUp size={16} className="text-ink-ghost" /> : <ChevronDown size={16} className="text-ink-ghost" />}
                          </div>
                        </button>
                        {isExp && (
                          <div className="border-t border-black/[0.02] divide-y divide-black/[0.02]">
                            {items.map((item, i) => (
                              <div key={i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-snow/30 transition-colors">
                                <Pill size={14} className="text-mediloon-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[15px] font-brand font-semibold text-ink-primary truncate">{item.brand_name}</p>
                                  <p className="text-[13px] font-body text-ink-secondary font-medium">{item.dosage} · {t('qty')}: {item.quantity}</p>
                                </div>
                                {item.dosage_frequency && (
                                  <span className="text-[13px] font-body text-ink-secondary flex items-center gap-1.5 bg-surface-snow px-2.5 py-1.5 rounded-lg">
                                    <Clock size={13} /> {item.dosage_frequency}
                                  </span>
                                )}
                                <button onClick={() => onReorder?.({ brand_name: item.brand_name })} className="text-[13px] font-brand text-mediloon-600 hover:text-mediloon-700 font-semibold bg-mediloon-50 hover:bg-mediloon-100 px-3 py-1.5 rounded-lg transition-colors ml-2">{t('reorder')}</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
