/**
 * SmartRefills Page
 * Full-page dashboard that brings together:
 *  - Prediction Timeline (depletion transparency)
 *  - Consumption Insights (frequency identification)
 *  - Order History (learning from previous orders)
 * Matches Mediloon white-glass UI.
 */
import React, { useState, useEffect } from 'react';
import {
  Brain, ArrowLeft, RefreshCw, Pill, ShoppingCart,
  Calendar, TrendingUp, Clock, Activity, History,
  Sparkles, ChevronRight,
} from 'lucide-react';
import PredictionTimeline from '../components/PredictionTimeline';
import ConsumptionInsights from '../components/ConsumptionInsights';
import { useRefillPredictions } from '../hooks/useRefillPredictions';

const API_BASE = '/api';

export default function SmartRefills({ user, onBack, onReorder }) {
  const customerId = user?.id;
  const { timeline, consumption, recentOrders, stats, loading, refresh } = useRefillPredictions(customerId);
  const [activeTab, setActiveTab] = useState('timeline');

  const tabs = [
    { key: 'timeline', label: 'Timeline', icon: <Calendar size={15} /> },
    { key: 'consumption', label: 'Consumption', icon: <Activity size={15} /> },
    { key: 'history', label: 'Order History', icon: <History size={15} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center shadow-sm">
                <Brain size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">Smart Refills</h1>
                <p className="text-[11px] text-gray-400">AI-powered medication insights</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {user && (
              <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5">
                <div className="w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs font-bold">
                  {(user.name || 'U').charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-gray-600">{user.name}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* AI Summary Banner */}
      {stats && !loading && (
        <div className="max-w-5xl mx-auto px-4 pt-5">
          <div className="bg-gradient-to-r from-red-500 to-rose-500 rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-20 w-24 h-24 bg-white/10 rounded-full translate-y-1/2" />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} />
                <span className="text-xs font-semibold uppercase tracking-wide opacity-90">AI-Learned Insights</span>
              </div>
              <p className="text-sm opacity-90 max-w-lg">
                Based on your order history, we're tracking <strong>{stats.total_medications} medication{stats.total_medications !== 1 ? 's' : ''}</strong>.
                {stats.regular_medications > 0 && <> You regularly order <strong>{stats.regular_medications}</strong> of them.</>}
                {stats.upcoming_refills > 0 && <> <strong>{stats.upcoming_refills}</strong> refill{stats.upcoming_refills !== 1 ? 's are' : ' is'} coming up soon.</>}
                {stats.critical_refills > 0 && <> ⚠️ <strong>{stats.critical_refills}</strong> need immediate attention!</>}
              </p>

              <div className="flex gap-4 mt-4">
                <div className="bg-white/20 rounded-xl px-4 py-2 text-center backdrop-blur-sm">
                  <p className="text-xl font-bold">{stats.total_medications}</p>
                  <p className="text-[10px] uppercase tracking-wide opacity-80">Tracked</p>
                </div>
                <div className="bg-white/20 rounded-xl px-4 py-2 text-center backdrop-blur-sm">
                  <p className="text-xl font-bold">{stats.avg_adherence}%</p>
                  <p className="text-[10px] uppercase tracking-wide opacity-80">Adherence</p>
                </div>
                <div className="bg-white/20 rounded-xl px-4 py-2 text-center backdrop-blur-sm">
                  <p className="text-xl font-bold">{stats.upcoming_refills}</p>
                  <p className="text-[10px] uppercase tracking-wide opacity-80">Due Soon</p>
                </div>
                {stats.critical_refills > 0 && (
                  <div className="bg-white/30 rounded-xl px-4 py-2 text-center backdrop-blur-sm shadow-soft">
                    <p className="text-xl font-bold">{stats.critical_refills}</p>
                    <p className="text-[10px] uppercase tracking-wide opacity-80">Critical</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-5">
        <div className="flex bg-gray-100 rounded-full p-1 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${activeTab === tab.key
                  ? 'bg-white shadow-sm text-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-5xl mx-auto px-4 py-5 pb-20">
        {activeTab === 'timeline' && (
          <PredictionTimeline
            timeline={timeline}
            stats={stats}
            onReorder={onReorder}
            loading={loading}
          />
        )}

        {activeTab === 'consumption' && (
          <ConsumptionInsights
            consumption={consumption}
            onReorder={onReorder}
            loading={loading}
          />
        )}

        {activeTab === 'history' && (
          <OrderHistory orders={recentOrders} loading={loading} />
        )}
      </div>
    </div>
  );
}

/* ===== Order History Sub-component ===== */
function OrderHistory({ orders, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
        <RefreshCw size={24} className="mx-auto text-gray-300 animate-spin mb-3" />
        <p className="text-gray-400 text-sm">Loading order history…</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-soft p-8 text-center">
        <History size={32} className="mx-auto text-gray-200 mb-3" />
        <p className="text-gray-500 font-medium">No order history</p>
        <p className="text-gray-400 text-sm mt-1">Previous orders will appear here.</p>
      </div>
    );
  }

  // Group by date
  const grouped = {};
  orders.forEach(o => {
    const date = (o.purchase_date || '').slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(o);
  });

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <History size={16} className="text-red-500" />
        Recent Purchase History
        <span className="text-xs text-gray-400 font-normal ml-1">({orders.length} items)</span>
      </h4>

      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="bg-white rounded-2xl shadow-soft hover:shadow-soft-hover transition-all duration-300 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center gap-2">
            <Calendar size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">{formatDate(date)}</span>
            <span className="text-[10px] text-gray-400">{items.length} item{items.length > 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <Pill size={14} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.brand_name}</p>
                  <p className="text-[11px] text-gray-400">{item.dosage} • Qty: {item.quantity}</p>
                </div>
                <div className="text-right">
                  {item.dosage_frequency && (
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock size={9} /> {item.dosage_frequency}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
