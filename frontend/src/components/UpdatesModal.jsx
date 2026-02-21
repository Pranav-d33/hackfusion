/**
 * Updates Modal Component
 * Shows auto-suggest depletion notifications and can initiate order conversations.
 * Bell icon in header → opens a slide-out panel with smart refill updates.
 * Each update has a "Reorder" CTA that initiates a chat conversation.
 * Matches Mediloon white-glass UI.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell, X, Pill, AlertCircle, AlertTriangle, CheckCircle,
  Clock, Calendar, ShoppingCart, Sparkles, MessageCircle,
  ChevronRight, BellRing, Maximize2, Minimize2,
} from 'lucide-react';

export default function UpdatesModal({ alerts, timeline, orders = [], loading, onInitiateOrder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  // Build update items from alerts + timeline depletions
  const updates = useMemo(() => {
    const items = [];

    // From alerts (most urgent first)
    if (alerts && alerts.length > 0) {
      alerts.forEach(alert => {
        if (dismissedIds.has(`alert-${alert.medication_id}`)) return;
        items.push({
          id: `alert-${alert.medication_id}`,
          type: 'depletion',
          urgency: alert.urgency || 'soon',
          title: alert.brand_name,
          dosage: alert.dosage,
          daysLeft: alert.days_until_depletion,
          message: alert.days_until_depletion <= 0
            ? 'This medicine has likely run out!'
            : alert.days_until_depletion === 1
              ? 'Running out tomorrow — consider reordering'
              : `Running out in ${alert.days_until_depletion} days`,
          data: alert,
          timestamp: new Date(),
        });
      });
    }

    // From timeline (predictions that are critical/soon but not already in alerts)
    if (timeline && timeline.length > 0) {
      const alertIds = new Set((alerts || []).map(a => a.medication_id));
      timeline
        .filter(t => (t.urgency === 'critical' || t.urgency === 'soon') && !alertIds.has(t.medication_id))
        .forEach(pred => {
          if (dismissedIds.has(`pred-${pred.medication_id}`)) return;
          items.push({
            id: `pred-${pred.medication_id}`,
            type: 'prediction',
            urgency: pred.urgency,
            title: pred.brand_name,
            dosage: pred.dosage,
            daysLeft: pred.days_until_depletion,
            message: `AI predicts depletion on ${pred.depletion_date}`,
            data: pred,
            timestamp: new Date(),
          });
        });
    }

    // From orders (recently placed)
    if (orders && orders.length > 0) {
      orders.forEach(order => {
        const updateId = `order-${order.order_id || order.id}`;
        if (dismissedIds.has(updateId)) return;
        const etaDays = order.days_left ?? (order.estimated_delivery ? Math.max(0, Math.round((new Date(order.estimated_delivery) - new Date()) / 86400000)) : null);
        items.push({
          id: updateId,
          type: 'order',
          urgency: 'soon',
          title: order.order_id ? `Order #${order.order_id}` : 'Order placed',
          dosage: null,
          daysLeft: etaDays ?? 0,
          message: order.status || (order.estimated_delivery ? `Delivery expected by ${order.estimated_delivery}` : 'Order placed'),
          data: order,
          timestamp: order.created_at ? new Date(order.created_at) : new Date(),
        });
      });
    }

    // Sort: critical first, then by days remaining
    return items.sort((a, b) => {
      const urgencyOrder = { critical: 0, soon: 1, upcoming: 2 };
      const ua = urgencyOrder[a.urgency] ?? 3;
      const ub = urgencyOrder[b.urgency] ?? 3;
      if (ua !== ub) return ua - ub;
      return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    });
  }, [alerts, timeline, orders, dismissedIds]);

  const criticalCount = updates.filter(u => u.urgency === 'critical').length;
  const totalCount = updates.length;

  const dismiss = (id) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  const handleReorder = (update) => {
    if (onInitiateOrder) {
      onInitiateOrder(`Reorder ${update.title}`);
    }
    dismiss(update.id);
    setIsOpen(false);
    setZoomed(false);
  };

  const urgencyStyles = (urgency) => {
    switch (urgency) {
      case 'critical':
        return {
          bg: 'bg-red-50', border: 'border-red-100', icon: <AlertCircle size={16} className="text-red-500" />,
          badge: 'bg-red-100 text-red-600', dot: 'bg-red-500',
        };
      case 'soon':
        return {
          bg: 'bg-amber-50', border: 'border-amber-100', icon: <AlertTriangle size={16} className="text-amber-500" />,
          badge: 'bg-amber-100 text-amber-600', dot: 'bg-amber-500',
        };
      default:
        return {
          bg: 'bg-blue-50', border: 'border-blue-100', icon: <Clock size={16} className="text-blue-500" />,
          badge: 'bg-blue-100 text-blue-600', dot: 'bg-blue-500',
        };
    }
  };

  const renderUpdatesList = (isZoomedView = false) => (
    <div className={`space-y-2 ${isZoomedView ? 'space-y-3' : ''}`}>
      {updates.length === 0 ? (
        <div className={`text-center ${isZoomedView ? 'py-16' : 'py-8'}`}>
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={20} className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">All caught up!</p>
          <p className="text-xs text-gray-400 mt-1">No pending refill updates right now</p>
        </div>
      ) : (
        updates.map(update => {
          const style = urgencyStyles(update.urgency);
          const isOrder = update.type === 'order';
          const isExpanded = expandedOrderId === update.id;
          const orderData = update.data || {};
          return (
            <div
              key={update.id}
              className={`rounded-xl border ${style.border} ${style.bg} ${isZoomedView ? 'p-4' : 'p-3'} transition-all duration-200 hover:shadow-md hover:scale-[1.02] cursor-pointer`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">{style.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`font-semibold text-gray-900 truncate ${isZoomedView ? 'text-sm' : 'text-xs'}`}>
                      {update.title}
                    </p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${style.badge}`}>
                      {update.urgency}
                    </span>
                  </div>
                  {update.dosage && (
                    <p className="text-[10px] text-gray-400 mb-1">{update.dosage}</p>
                  )}
                  <p className={`text-gray-600 ${isZoomedView ? 'text-xs' : 'text-[11px]'}`}>
                    {update.message}
                  </p>

                  {isOrder && (
                    <div className={`mt-2 ${isZoomedView ? 'space-y-2' : 'space-y-1.5'}`}>
                      <div className="flex items-center flex-wrap gap-2 text-[11px] text-gray-600">
                        {orderData.estimated_delivery && (
                          <span className="px-2 py-1 rounded-lg bg-white border border-gray-100 font-semibold text-gray-700">ETA {orderData.estimated_delivery}</span>
                        )}
                        {orderData.total != null && (
                          <span className="px-2 py-1 rounded-lg bg-white border border-gray-100 font-semibold text-gray-700">€{Number(orderData.total).toFixed(2)}</span>
                        )}
                        {orderData.address && (
                          <span className="px-2 py-1 rounded-lg bg-white border border-gray-100 text-gray-600 truncate max-w-full">Deliver to: {orderData.address}</span>
                        )}
                      </div>
                      {isExpanded && orderData.items && orderData.items.length > 0 && (
                        <div className="text-[11px] text-gray-600 space-y-1 bg-white/70 border border-gray-100 rounded-lg p-2">
                          <p className="font-semibold text-gray-700">Items</p>
                          <div className="flex flex-wrap gap-1.5">
                            {orderData.items.map((it, idx) => (
                              <span key={idx} className="px-2 py-1 bg-gray-50 rounded-full text-[11px] text-gray-700 border border-gray-100">
                                {(it.brand_name || 'Item')} x{it.quantity}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`flex items-center gap-2 ${isZoomedView ? 'mt-3' : 'mt-2'}`}>
                    {isOrder ? (
                      <>
                        <button
                          onClick={() => setExpandedOrderId(isExpanded ? null : update.id)}
                          className={`flex items-center gap-1.5 bg-gray-900 text-white rounded-lg transition-all duration-200 shadow-sm font-medium hover:scale-105 active:scale-95 hover:shadow-md ${isZoomedView ? 'text-xs px-3 py-2' : 'text-[11px] px-2.5 py-1.5'}`}
                        >
                          <ChevronRight size={isZoomedView ? 13 : 11} className={isExpanded ? 'rotate-90 transition-transform' : ''} /> View details
                        </button>
                        <button
                          onClick={() => dismiss(update.id)}
                          className={`text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110 active:scale-95 ${isZoomedView ? 'text-xs' : 'text-[10px]'}`}
                        >
                          Dismiss
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleReorder(update)}
                          className={`flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all duration-200 shadow-sm font-medium hover:scale-105 active:scale-95 hover:shadow-md
                        ${isZoomedView ? 'text-xs px-3 py-2' : 'text-[11px] px-2.5 py-1.5'}`}
                        >
                          <MessageCircle size={isZoomedView ? 13 : 11} /> Order via Chat
                        </button>
                        <button
                          onClick={() => dismiss(update.id)}
                          className={`text-gray-400 hover:text-gray-600 transition-all duration-200 hover:scale-110 active:scale-95 ${isZoomedView ? 'text-xs' : 'text-[10px]'}`}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Days badge */}
                <div className="flex-shrink-0 text-right">
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${
                    update.daysLeft <= 0 ? 'bg-red-100 text-red-600' :
                    update.daysLeft <= 3 ? 'bg-red-50 text-red-500' :
                    update.daysLeft <= 7 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'
                  }`}>
                    <Clock size={10} />
                    <span className="text-[10px] font-bold">
                      {update.daysLeft <= 0 ? 'Now' : `${update.daysLeft}d`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      {/* Bell trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
        title="Refill Updates"
      >
        {totalCount > 0 ? (
          <BellRing size={20} className={criticalCount > 0 ? 'text-red-500 animate-bounce-subtle' : ''} />
        ) : (
          <Bell size={20} />
        )}
        {totalCount > 0 && (
          <span className={`absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold border-2 border-white px-1 ${
            criticalCount > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {totalCount}
          </span>
        )}
      </button>

      {/* Slide-out panel */}
      {isOpen && !zoomed && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[998] bg-black/20" onClick={() => setIsOpen(false)} />

          {/* Panel */}
          <div className="fixed top-16 right-4 z-[999] w-[360px] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-red-500" />
                <h3 className="text-xs font-bold text-gray-800">Smart Updates</h3>
                {criticalCount > 0 && (
                  <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">
                    {criticalCount} urgent
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setZoomed(true); }}
                  className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Expand"
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Updates list */}
            <div className="flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="py-8 text-center">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Loading updates…</p>
                </div>
              ) : (
                renderUpdatesList(false)
              )}
            </div>
          </div>
        </>
      )}

      {/* Zoomed full-screen modal */}
      {zoomed && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8" onClick={() => { setZoomed(false); setIsOpen(false); }}>
          <div
            className="w-full max-w-lg max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center">
                  <BellRing size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Refill Updates</h2>
                  <p className="text-[11px] text-gray-400">
                    {totalCount} update{totalCount !== 1 ? 's' : ''} • AI-suggested refills
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setZoomed(false); setIsOpen(false); }}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Loading updates…</p>
                </div>
              ) : (
                renderUpdatesList(true)
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
