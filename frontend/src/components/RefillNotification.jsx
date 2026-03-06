/**
 * Refill Notification Component (Redesigned)
 * Elegant floating toast + slide-out panel for auto-suggested refills.
 * Matches Mediloon white-glass UI with red accents.
 */
import React, { useState, useEffect } from 'react';
import {
  Bell, Pill, X, AlertCircle, AlertTriangle, CheckCircle,
  Clock, Calendar, ShoppingCart, TrendingUp, Sparkles,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

const API_BASE = '/api';

export default function RefillNotification({ customerId, onReorder }) {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [expanded, setExpanded] = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);
  const [toastAlert, setToastAlert] = useState(null);

  useEffect(() => {
    if (customerId) {
      fetchAlerts();
      const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [customerId]);

  // Show auto-toast for most critical alert
  useEffect(() => {
    if (alerts.length > 0 && !autoDismissed) {
      const critical = alerts.find(a => a.urgency === 'critical');
      if (critical && !dismissed.has(critical.medication_id)) {
        setToastAlert(critical);
        // Auto-hide toast after 5 seconds
        const t = setTimeout(() => setToastAlert(null), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [alerts, autoDismissed, dismissed]);

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/refill/customer/${customerId}/alerts`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch refill alerts:', err);
    }
  };

  const dismissAlert = (medicationId) => {
    setDismissed(prev => new Set([...prev, medicationId]));
  };

  const handleReorder = (alert) => {
    if (onReorder) onReorder(alert);
    dismissAlert(alert.medication_id);
  };

  const activeAlerts = alerts.filter(a => !dismissed.has(a.medication_id));
  const criticalCount = activeAlerts.filter(a => a.urgency === 'critical').length;
  const soonCount = activeAlerts.filter(a => a.urgency === 'soon').length;

  if (activeAlerts.length === 0) return null;

  const urgencyIcon = (urgency) => {
    switch (urgency) {
      case 'critical': return <AlertCircle size={16} className="text-red-500" />;
      case 'soon': return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <CheckCircle size={16} className="text-emerald-500" />;
    }
  };

  const urgencyBg = (urgency) => {
    switch (urgency) {
      case 'critical': return 'bg-red-50 border-red-100';
      case 'soon': return 'bg-amber-50 border-amber-100';
      default: return 'bg-emerald-50 border-emerald-100';
    }
  };

  return (
    <>
      {/* ===== Auto-Toast Pop-up ===== */}
      {toastAlert && !expanded && (
        <div className="fixed top-20 right-4 z-[1001] animate-fade-in-up">
          <div className="bg-white/95 backdrop-blur-3xl rounded-[1.5rem] shadow-apple-2xl border border-mediloon-100 p-4 w-[320px] relative overflow-hidden">
            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-mediloon-500 to-mediloon-700" />

            <button
              onClick={() => { setToastAlert(null); setAutoDismissed(true); }}
              className="absolute top-3 right-3 p-1 text-ink-ghost hover:text-ink-primary rounded-full hover:bg-surface-snow transition-colors"
            >
              <X size={14} />
            </button>

            <div className="flex items-start gap-3 mt-1">
              <div className="p-2 bg-mediloon-50 rounded-xl">
                <Sparkles size={20} className="text-mediloon-500" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-brand font-bold text-mediloon-600 uppercase tracking-wide mb-0.5">Smart Refill Suggestion</p>
                <p className="text-[15px] font-brand font-semibold text-ink-primary">{toastAlert.brand_name}</p>
                <p className="text-[13px] font-body text-ink-secondary mt-0.5">
                  {toastAlert.days_until_depletion <= 0
                    ? t('thisMedicineLikelyRunOut')
                    : toastAlert.days_until_depletion === 1
                      ? t('runningOutTomorrow')
                      : t('runningOutInDays', { days: toastAlert.days_until_depletion })}
                </p>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => { handleReorder(toastAlert); setToastAlert(null); }}
                    className="flex-1 text-xs bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ShoppingCart size={13} /> {t('reorder')}
                  </button>
                  <button
                    onClick={() => { setToastAlert(null); setExpanded(true); }}
                    className="text-xs text-gray-500 hover:text-gray-700 py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {t('viewDetails')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Floating Toggle Button ===== */}
      <div className="fixed bottom-6 right-6 z-[1000]">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`
            flex items-center gap-2 px-4 py-2.5 rounded-full font-brand font-bold text-[14px]
            shadow-apple transition-all duration-300 hover:-translate-y-0.5
            ${criticalCount > 0
              ? 'bg-gradient-to-r from-mediloon-500 to-mediloon-600 text-white shadow-mediloon-200'
              : 'bg-white text-ink-primary border border-black/[0.04] shadow-apple-md hover:border-black/[0.08]'}
          `}
        >
          <Bell size={16} className={criticalCount > 0 ? 'animate-bounce-subtle' : ''} />
          <span>{activeAlerts.length} {t('refillUpdates')}</span>
          {criticalCount > 0 && (
            <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
              {criticalCount} {t('urgent')}
            </span>
          )}
        </button>

        {/* ===== Expanded Panel ===== */}
        {expanded && (
          <div className="absolute bottom-14 right-0 w-[380px] max-h-[460px] bg-white/95 backdrop-blur-3xl rounded-[1.5rem] shadow-apple-2xl border border-black/[0.04] overflow-hidden animate-slide-up-spring">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.04] bg-surface-snow/50">
              <div className="flex items-center gap-2">
                <Pill size={16} className="text-mediloon-500" />
                <h3 className="text-[14px] font-brand font-bold text-ink-primary">{t('smartUpdates')}</h3>
              </div>
              <div className="flex items-center gap-2">
                {criticalCount > 0 && (
                  <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                    {criticalCount} critical
                  </span>
                )}
                {soonCount > 0 && (
                  <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">
                    {soonCount} soon
                  </span>
                )}
                <button onClick={() => setExpanded(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Alert List */}
            <div className="overflow-y-auto max-h-[360px] p-3 space-y-2">
              {activeAlerts.map((alert, i) => (
                <div key={i} className={`rounded-[1rem] border p-3 ${urgencyBg(alert.urgency)} transition-all hover:shadow-apple-sm`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{urgencyIcon(alert.urgency)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-brand font-semibold text-ink-primary truncate">{alert.brand_name}</p>
                      <p className="text-[12px] font-body text-ink-secondary">{alert.dosage}</p>
                      <p className="text-[12px] font-body text-ink-secondary mt-1 flex items-center gap-1.5">
                        {alert.days_until_depletion <= 0
                          ? <><AlertTriangle size={12} className="text-red-400" /> {t('thisMedicineLikelyRunOut')}</>
                          : alert.days_until_depletion === 1
                            ? <><Clock size={12} className="text-amber-400" /> {t('runningOutTomorrow')}</>
                            : <><Calendar size={12} className="text-blue-400" /> {t('runningOutInDays', { days: alert.days_until_depletion })}</>}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        onClick={() => handleReorder(alert)}
                        className="text-[12px] font-brand font-semibold bg-mediloon-500 hover:bg-mediloon-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <ShoppingCart size={11} /> {t('reorder')}
                      </button>
                      <button
                        onClick={() => dismissAlert(alert.medication_id)}
                        className="text-[11px] font-brand text-ink-ghost hover:text-ink-secondary transition-colors"
                      >
                        {t('dismiss')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
