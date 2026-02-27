/**
 * My Orders & Refills Modal
 * Full-width stacked layout:
 *   - Top: Prediction Timeline (needs full width for the 30-day horizontal track)
 *   - Bottom: Active + Past orders (scrollable list)
 * Tooltip-safe: timeline section uses overflow-visible so hover cards render.
 */
import React, { useEffect, useState } from 'react';
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
        className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-red-200 transition-all duration-200 group"
      >
        <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 group-hover:from-red-100 group-hover:to-red-200 rounded-xl transition-colors">
          <ShoppingBag size={18} className="text-red-500" />
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-base font-bold text-gray-800">{t('myOrdersRefills')}</p>
          <p className="text-xs text-gray-400 truncate">
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
      {isOpen && (
        <div className={`fixed inset-0 z-[70] flex items-center ${isVoiceMode ? 'justify-end p-4 pr-6 bg-transparent' : 'justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm'}`} onClick={handleClose}>
          <div
            className={`w-full ${isVoiceMode ? 'max-w-md animate-slide-in-right h-[calc(100vh-2rem)] my-4' : 'max-w-[1000px] animate-fade-in-up h-[90vh] sm:max-h-[85vh]'} bg-white rounded-3xl shadow-glass-lg border border-gray-100 flex flex-col`}
            onClick={e => e.stopPropagation()}
          >

            {/* ═══ Header ═══ */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center shadow-md">
                  <Activity size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t('myOrdersRefills')}</h2>
                  <p className="text-xs text-gray-400">
                    {activeCount > 0 ? `${activeCount} ${t('active').toLowerCase()} · ` : ''}{orderCount} {t('pastOrders').toLowerCase()} · {timelineCount} {t('tracked')}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* ═══ Scrollable Body ═══ */}
            <div className="flex-1 overflow-y-auto">

              {/* ─── Section 1: Prediction Timeline (full width) ─── */}
              <div className="px-6 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={18} className="text-blue-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">{t('refillPredictions')}</h3>
                  <span className="text-xs text-gray-400 ml-1">{t('aiMedicationTimeline')}</span>
                </div>

                {/* Timeline Track — overflow visible for tooltips */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw size={20} className="text-gray-300 animate-spin" />
                  </div>
                ) : !timeline || timeline.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-2xl border border-gray-100">
                    <Calendar size={28} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">{t('noMedicationTimeline')}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{t('orderMedicationsToSeePredictions')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Visual Track */}
                    <div className="relative pt-16 pb-2" style={{ overflow: 'visible' }}>
                      {/* Scale labels */}
                      <div className="absolute top-1 left-0 right-0 flex justify-between text-xs text-gray-400 px-2 uppercase tracking-widest font-medium">
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
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                              style={{ left: `${left}%`, zIndex: 20 }}
                            >
                              <div className={`w-9 h-9 rounded-full ${cfg.dot} flex items-center justify-center shadow-lg cursor-pointer transition-transform group-hover:scale-125 border-2 border-white`}>
                                <Pill size={14} className="text-white" />
                              </div>
                              {/* Hover tooltip — positioned ABOVE, overflow visible */}
                              <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 min-w-[220px] z-[100]">
                                <p className="font-bold text-gray-900 text-base">{pred.brand_name}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{pred.dosage}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.badge}`}>{getDaysLabel(pred.days_until_depletion, t)}</span>
                                  {pred.frequency_label && (
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                      <TrendingUp size={12} /> {pred.frequency_label}
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => onReorder?.(pred)}
                                  className="mt-4 w-full text-sm bg-red-500 hover:bg-red-600 text-white py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors font-semibold"
                                >
                                  <ShoppingCart size={14} /> {t('reorder')}
                                </button>
                                {/* Arrow */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45 -mt-1.5" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex justify-center gap-5 text-xs text-gray-500 font-medium">
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
                                <p className="text-sm font-semibold text-gray-800 truncate">{pred.brand_name}</p>
                                <p className="text-xs text-gray-500">{pred.dosage}</p>
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
              <div className="mx-6 border-t border-gray-100" />

              {/* ─── Section 2: Order History ─── */}
              <div className="px-6 pt-4 pb-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <History size={18} className="text-amber-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">{t('orderHistory')}</h3>
                </div>

                {/* Active Orders */}
                {activeCount > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-green-600 flex items-center gap-1.5 px-1 mb-1">
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
                                <p className="text-sm font-semibold text-gray-800">Order #{order.order_id}</p>
                                <p className="text-xs text-green-700">{order.status || t('confirmed')}{order.estimated_delivery ? ` · ${t('etaShort')} ${order.estimated_delivery}` : ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {order.total != null && <span className="text-xs font-bold text-gray-600">€{Number(order.total).toFixed(2)}</span>}
                              {isExp ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                            </div>
                          </button>
                          {isExp && (
                            <div className="border-t border-green-100 divide-y divide-green-50">
                              {(order.items || []).map((item, i) => (
                                <div key={i} className="flex items-center gap-3 px-5 py-3">
                                  <Pill size={14} className="text-green-500 flex-shrink-0" />
                                  <span className="text-sm text-gray-700 flex-1 truncate font-medium">{item.brand_name}</span>
                                  <span className="text-xs text-gray-500 font-medium">×{item.quantity}</span>
                                  <button onClick={() => onReorder?.({ brand_name: item.brand_name })} className="text-xs text-red-500 font-semibold hover:text-red-700 bg-white/50 px-2.5 py-1 rounded-lg">{t('reorder')}</button>
                                </div>
                              ))}
                              {order.address && <p className="px-5 py-3 text-xs text-gray-500 border-t border-green-50/50">📍 {t('deliverTo')}: {order.address}</p>}
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
                    <div className="flex-1 h-px bg-gray-100" />
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('pastOrders')}</p>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}

                {loading ? (
                  <div className="py-8 text-center">
                    <RefreshCw size={20} className="mx-auto text-gray-300 animate-spin mb-2" />
                    <p className="text-xs text-gray-400">{t('loadingHistory')}</p>
                  </div>
                ) : groupedEntries.length === 0 && activeCount === 0 ? (
                  <div className="py-8 text-center">
                    <ShoppingBag size={28} className="mx-auto text-gray-200 mb-2" />
                    <p className="text-sm text-gray-400">{t('noOrdersYet')}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{t('yourOrderHistoryWillAppear')}</p>
                  </div>
                ) : groupedEntries.length === 0 ? null : (
                  groupedEntries.map(([date, items]) => {
                    const isExp = expandedDate === date;
                    return (
                      <div key={date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                        <button
                          onClick={() => setExpandedDate(isExp ? null : date)}
                          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Calendar size={16} className="text-red-400" />
                            <div className="text-left">
                              <p className="text-sm font-semibold text-gray-800">{formatDate(date, bcp47 || 'en-US')}</p>
                              <p className="text-xs text-gray-500 font-medium">{items.length} {items.length > 1 ? t('items') : t('item')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden sm:flex gap-1.5">
                              {items.slice(0, 2).map((it, i) => (
                                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full truncate max-w-[90px] font-medium">{it.brand_name}</span>
                              ))}
                            </div>
                            {isExp ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                          </div>
                        </button>
                        {isExp && (
                          <div className="border-t border-gray-50 divide-y divide-gray-50">
                            {items.map((item, i) => (
                              <div key={i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/30 transition-colors">
                                <Pill size={14} className="text-red-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 truncate">{item.brand_name}</p>
                                  <p className="text-xs text-gray-500 font-medium">{item.dosage} · {t('qty')}: {item.quantity}</p>
                                </div>
                                {item.dosage_frequency && (
                                  <span className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded-lg">
                                    <Clock size={12} /> {item.dosage_frequency}
                                  </span>
                                )}
                                <button onClick={() => onReorder?.({ brand_name: item.brand_name })} className="text-xs text-red-500 hover:text-red-700 font-semibold bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors ml-2">{t('reorder')}</button>
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
        </div>
      )}
    </>
  );
}
