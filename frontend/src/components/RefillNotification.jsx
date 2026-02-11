/**
 * Refill Notification Component
 * Toast/popup component showing refill alerts for logged-in customers.
 */
import React, { useState, useEffect } from 'react';
import { Bell, Pill, X, AlertCircle, AlertTriangle, CheckCircle, Clock, Calendar, ShoppingCart } from 'lucide-react';

const API_BASE = '/api';

export default function RefillNotification({ customerId, onReorder }) {
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (customerId) {
      fetchAlerts();
      // Refresh every 5 minutes
      const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [customerId]);

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
    if (onReorder) {
      onReorder(alert);
    }
  };

  const activeAlerts = alerts.filter(a => !dismissed.has(a.medication_id));
  const criticalCount = activeAlerts.filter(a => a.urgency === 'critical').length;

  if (activeAlerts.length === 0) return null;

  return (
    <div className="refill-notification">
      <button
        className={`notification-toggle ${criticalCount > 0 ? 'critical' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Bell size={18} />
          <span>{activeAlerts.length} Refill{activeAlerts.length > 1 ? 's' : ''} Due</span>
        </div>
        {criticalCount > 0 && <span className="critical-badge">{criticalCount} urgent</span>}
      </button>

      {expanded && (
        <div className="notification-panel">
          <div className="panel-header">
            <h3 className="flex items-center gap-2"><Pill size={16} /> Medication Refills</h3>
            <button className="close-btn" onClick={() => setExpanded(false)}><X size={18} /></button>
          </div>

          <div className="alert-list">
            {activeAlerts.map((alert, i) => (
              <div key={i} className={`alert-item ${alert.urgency}`}>
                <div className="alert-icon">
                  {alert.urgency === 'critical' ? <AlertCircle size={20} className="text-red-500" /> : alert.urgency === 'soon' ? <AlertTriangle size={20} className="text-amber-500" /> : <CheckCircle size={20} className="text-green-500" />}
                </div>
                <div className="alert-content">
                  <strong>{alert.brand_name}</strong>
                  <span className="dosage">{alert.dosage}</span>
                  <p className="alert-message flex items-center gap-1.5 align-middle">
                    {alert.days_until_depletion <= 0
                      ? <><AlertTriangle size={14} className="text-red-400" /> Medicine has run out!</>
                      : alert.days_until_depletion === 1
                        ? <><Clock size={14} className="text-amber-400 text-sm" /> Runs out tomorrow</>
                        : <><Calendar size={14} className="text-blue-400" /> Runs out in {alert.days_until_depletion} days</>
                    }
                  </p>
                </div>
                <div className="alert-actions">
                  <button
                    className="reorder-btn flex items-center gap-1"
                    onClick={() => handleReorder(alert)}
                  >
                    <ShoppingCart size={14} /> Reorder
                  </button>
                  <button
                    className="dismiss-btn"
                    onClick={() => dismissAlert(alert.medication_id)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .refill-notification {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
        }

        .notification-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border: none;
          border-radius: 50px;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
          transition: all 0.3s;
          animation: pulse 2s infinite;
        }

        .notification-toggle.critical {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
        }

        .notification-toggle:hover {
          transform: translateY(-2px);
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 4px 30px rgba(59, 130, 246, 0.6); }
        }

        .critical-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 0.2rem 0.5rem;
          border-radius: 10px;
          font-size: 0.75rem;
          margin-left: 0.5rem;
        }

        .notification-panel {
          position: absolute;
          bottom: 60px;
          right: 0;
          width: 360px;
          max-height: 400px;
          overflow-y: auto;
          background: #1e1e2e;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-header h3 {
          margin: 0;
          font-size: 1rem;
          color: #fff;
        }

        .close-btn {
          background: none;
          border: none;
          color: #888;
          font-size: 1.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .alert-list {
          padding: 0.5rem;
        }

        .alert-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          border-radius: 8px;
          margin-bottom: 0.5rem;
          background: rgba(255, 255, 255, 0.05);
        }

        .alert-item.critical {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .alert-item.soon {
          background: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .alert-icon {
          font-size: 1.25rem;
          display: flex;
          align-items: center;
          padding-top: 2px;
        }

        .alert-content {
          flex: 1;
          color: #fff;
        }

        .alert-content strong {
          display: block;
          margin-bottom: 0.25rem;
        }

        .dosage {
          font-size: 0.8rem;
          color: #888;
        }

        .alert-message {
          margin: 0.5rem 0 0;
          font-size: 0.85rem;
          color: #bbb;
        }

        .alert-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .reorder-btn {
          padding: 0.4rem 0.75rem;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 0.8rem;
          cursor: pointer;
          white-space: nowrap;
        }

        .dismiss-btn {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          font-size: 0.9rem;
          display: flex;
          justify-content: center;
        }

        .dismiss-btn:hover {
          color: #999;
        }
      `}</style>
    </div>
  );
}
