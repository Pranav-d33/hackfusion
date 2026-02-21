/**
 * Past Orders Modal
 * Compact button that opens a zoomed modal with full order history.
 * Matches Mediloon white-glass UI.
 */
import React, { useState } from 'react';
import {
  History, X, Pill, Calendar, Clock,
  Package, ChevronDown, ChevronUp, ShoppingBag,
  Maximize2,
} from 'lucide-react';

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function PastOrdersModal({ orders, activeOrders, loading, onReorder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedDate, setExpandedDate] = useState(null);
  const [expandedActiveOrder, setExpandedActiveOrder] = useState(null);

  // Group past orders by date
  const grouped = {};
  (orders || []).forEach(o => {
    const date = (o.purchase_date || '').slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(o);
  });
  const groupedEntries = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  const orderCount = orders?.length || 0;
  const dateCount = groupedEntries.length;
  const activeCount = activeOrders?.length || 0;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-red-200 transition-all duration-200 group"
      >
        <div className="p-1.5 bg-gray-50 group-hover:bg-red-50 rounded-lg transition-colors">
          <History size={14} className="text-gray-400 group-hover:text-red-500 transition-colors" />
        </div>
        <div className="text-left">
          <p className="text-[11px] font-semibold text-gray-700">My Orders</p>
          <p className="text-[9px] text-gray-400">
            {loading ? 'Loading...' : (activeCount > 0 ? `${activeCount} active • ` : '') + (orderCount > 0 ? `${orderCount} past` : 'No orders yet')}
          </p>
        </div>
        {activeCount > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ml-1">{activeCount}</span>
        )}
        <Maximize2 size={10} className="text-gray-300 ml-1" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8" onClick={() => setIsOpen(false)}>
          <div
            className="w-full max-w-xl max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center">
                  <ShoppingBag size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">My Orders</h2>
                  <p className="text-[11px] text-gray-400">
                    {activeCount > 0 ? `${activeCount} active • ` : ''}{orderCount} past item{orderCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {/* ── Active / Current Orders ── */}
              {activeCount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">Active Orders</p>
                  </div>
                  {activeOrders.map((order) => {
                    const isExp = expandedActiveOrder === order.order_id;
                    return (
                      <div key={order.id || order.order_id} className="bg-green-50 rounded-xl border border-green-100 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setExpandedActiveOrder(isExp ? null : order.order_id)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-green-100/50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-green-100 rounded-lg">
                              <Package size={13} className="text-green-600" />
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-semibold text-gray-800">Order #{order.order_id}</p>
                              <p className="text-[10px] text-green-700 font-medium">
                                {order.status || 'Confirmed'}{order.estimated_delivery ? ` · ETA ${order.estimated_delivery}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {order.total != null && (
                              <span className="text-[10px] font-bold text-gray-600">€{Number(order.total).toFixed(2)}</span>
                            )}
                            {isExp ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          </div>
                        </button>
                        {isExp && (
                          <div className="border-t border-green-100 divide-y divide-green-50">
                            {(order.items || []).map((item, i) => (
                              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center flex-shrink-0 border border-green-100">
                                  <Pill size={12} className="text-green-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-800 truncate">{item.brand_name}</p>
                                  <p className="text-[10px] text-gray-400">Qty: {item.quantity}</p>
                                </div>
                                <button
                                  onClick={() => onReorder?.({ brand_name: item.brand_name })}
                                  className="text-[10px] text-red-500 hover:text-red-700 font-semibold hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                                >
                                  Reorder
                                </button>
                              </div>
                            ))}
                            {order.address && (
                              <p className="px-4 py-2 text-[10px] text-gray-400">📍 {order.address}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Divider between sections */}
              {activeCount > 0 && orderCount > 0 && (
                <div className="flex items-center gap-2 px-1 pt-1">
                  <div className="flex-1 h-px bg-gray-100" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Past Orders</p>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}
              {activeCount === 0 && (
                <div className="flex items-center gap-2 px-1">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Past Orders</p>
                </div>
              )}

              {loading ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Loading order history…</p>
                </div>
              ) : groupedEntries.length === 0 && activeCount === 0 ? (
                <div className="py-12 text-center">
                  <ShoppingBag size={32} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No orders yet</p>
                  <p className="text-xs text-gray-400 mt-1">Your order history will appear here</p>
                </div>
              ) : groupedEntries.length === 0 ? null : (
                groupedEntries.map(([date, items]) => {
                  const isExp = expandedDate === date;
                  return (
                    <div key={date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200">
                      {/* Date header */}
                      <button
                        onClick={() => setExpandedDate(isExp ? null : date)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-red-50 rounded-lg">
                            <Calendar size={13} className="text-red-400" />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-semibold text-gray-700">{formatDate(date)}</p>
                            <p className="text-[10px] text-gray-400">{items.length} medicine{items.length > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Preview pills */}
                          <div className="hidden sm:flex gap-1">
                            {items.slice(0, 3).map((it, i) => (
                              <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                                {it.brand_name}
                              </span>
                            ))}
                          </div>
                          {isExp ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        </div>
                      </button>

                      {/* Items */}
                      {isExp && (
                        <div className="border-t border-gray-50 divide-y divide-gray-50 animate-fade-in-up">
                          {items.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/30 transition-colors">
                              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Pill size={14} className="text-red-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{item.brand_name}</p>
                                <p className="text-[11px] text-gray-400">{item.dosage} • Qty: {item.quantity}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {item.dosage_frequency && (
                                  <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full">
                                    <Clock size={9} /> {item.dosage_frequency}
                                  </span>
                                )}
                                <button
                                  onClick={() => onReorder?.({ brand_name: item.brand_name })}
                                  className="text-[10px] text-red-500 hover:text-red-700 font-semibold hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                                >
                                  Reorder
                                </button>
                              </div>
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
      )}
    </>
  );
}
