/**
 * Prediction Timeline Component
 * Visual calendar showing medication depletion dates for customers.
 */
import React, { useState, useEffect } from 'react';
import { Calendar, Pill, ShoppingCart } from 'lucide-react';

const API_BASE = '/api';

export default function PredictionTimeline({ customerId, onReorder }) {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      fetchPredictions();
    }
  }, [customerId]);

  const fetchPredictions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/refill/customer/${customerId}/alerts`);
      const data = await res.json();
      setPredictions(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
    }
    setLoading(false);
  };

  const getUrgencyStyle = (urgency) => {
    switch (urgency) {
      case 'critical':
        return { bg: '#ef4444', text: '#fff', border: '#dc2626' };
      case 'soon':
        return { bg: '#f59e0b', text: '#fff', border: '#d97706' };
      default:
        return { bg: '#22c55e', text: '#fff', border: '#16a34a' };
    }
  };

  const getDaysLabel = (days) => {
    if (days <= 0) return 'OUT';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const getTimelinePosition = (days) => {
    // Map days to percentage (0 = left, 30 = right)
    const maxDays = 30;
    const position = Math.min(Math.max(days, 0), maxDays) / maxDays * 100;
    return position;
  };

  if (loading) {
    return (
      <div className="prediction-timeline loading">
        <div className="loading-spinner">Loading predictions...</div>
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="prediction-timeline empty">
        <p className="flex items-center justify-center gap-2"><Calendar size={20} /> No medication timeline to display.</p>
        <p className="hint">Order medications to see your refill schedule.</p>
      </div>
    );
  }

  return (
    <div className="prediction-timeline">
      <div className="timeline-header">
        <h3 className="flex items-center gap-2"><Calendar size={20} /> My Medication Timeline</h3>
        <span className="timeline-range">Next 30 days</span>
      </div>

      <div className="timeline-scale">
        <div className="scale-label">Today</div>
        <div className="scale-label">1 week</div>
        <div className="scale-label">2 weeks</div>
        <div className="scale-label">3 weeks</div>
        <div className="scale-label">4 weeks</div>
      </div>

      <div className="timeline-track">
        <div className="danger-zone" style={{ width: '10%' }}></div>
        <div className="warning-zone" style={{ left: '10%', width: '15%' }}></div>

        {predictions.map((pred, i) => {
          const style = getUrgencyStyle(pred.urgency);
          const position = getTimelinePosition(pred.days_until_depletion);

          return (
            <div
              key={i}
              className="timeline-item"
              style={{ left: `${position}%` }}
            >
              <div
                className="timeline-marker"
                style={{ backgroundColor: style.bg, borderColor: style.border }}
                title={`${pred.brand_name} - ${getDaysLabel(pred.days_until_depletion)}`}
              >
                <Pill size={16} color="white" />
              </div>
              <div className="timeline-tooltip">
                <strong>{pred.brand_name}</strong>
                <span className="dosage">{pred.dosage}</span>
                <span
                  className="days-badge"
                  style={{ backgroundColor: style.bg }}
                >
                  {getDaysLabel(pred.days_until_depletion)}
                </span>
                <button
                  className="quick-reorder flex items-center justify-center gap-1"
                  onClick={() => onReorder && onReorder(pred)}
                >
                  <ShoppingCart size={12} /> Reorder
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="timeline-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#ef4444' }}></span>
          Critical (0-3 days)
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#f59e0b' }}></span>
          Soon (4-7 days)
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#22c55e' }}></span>
          Upcoming (8+ days)
        </div>
      </div>

      <div className="medication-cards">
        {predictions.map((pred, i) => {
          const style = getUrgencyStyle(pred.urgency);
          return (
            <div
              key={i}
              className="med-card"
              style={{ borderLeftColor: style.bg }}
            >
              <div className="med-info">
                <strong>{pred.brand_name}</strong>
                <span>{pred.dosage} • {pred.generic_name}</span>
              </div>
              <div className="med-timing">
                <span
                  className="days-badge"
                  style={{ backgroundColor: style.bg }}
                >
                  {getDaysLabel(pred.days_until_depletion)}
                </span>
                <span className="date">{pred.depletion_date}</span>
              </div>
              <button
                className="reorder-btn"
                onClick={() => onReorder && onReorder(pred)}
              >
                Reorder
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        .prediction-timeline {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 1.5rem;
          margin: 1rem 0;
        }

        .prediction-timeline.loading,
        .prediction-timeline.empty {
          text-align: center;
          color: #888;
          padding: 2rem;
        }

        .hint { font-size: 0.85rem; opacity: 0.7; }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .timeline-header h3 {
          margin: 0;
          color: #fff;
        }

        .timeline-range {
          font-size: 0.85rem;
          color: #888;
          background: rgba(255, 255, 255, 0.1);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
        }

        .timeline-scale {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          padding: 0 0.5rem;
        }

        .scale-label {
          font-size: 0.75rem;
          color: #666;
        }

        .timeline-track {
          position: relative;
          height: 60px;
          background: linear-gradient(90deg, 
            rgba(34, 197, 94, 0.1) 0%,
            rgba(245, 158, 11, 0.1) 25%,
            rgba(239, 68, 68, 0.05) 100%
          );
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .danger-zone {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: rgba(239, 68, 68, 0.15);
          border-radius: 8px 0 0 8px;
        }

        .warning-zone {
          position: absolute;
          top: 0;
          height: 100%;
          background: rgba(245, 158, 11, 0.1);
        }

        .timeline-item {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
        }

        .timeline-marker {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .timeline-marker:hover {
          transform: scale(1.2);
        }

        .timeline-tooltip {
          display: none;
          position: absolute;
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%);
          background: #1e1e2e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 0.75rem;
          min-width: 150px;
          text-align: center;
          z-index: 100;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }

        .timeline-item:hover .timeline-tooltip {
          display: block;
        }

        .timeline-tooltip strong {
          display: block;
          color: #fff;
          margin-bottom: 0.25rem;
        }

        .timeline-tooltip .dosage {
          display: block;
          font-size: 0.8rem;
          color: #888;
          margin-bottom: 0.5rem;
        }

        .days-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #fff;
        }

        .quick-reorder {
          margin-top: 0.5rem;
          padding: 0.4rem 0.75rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 0.8rem;
          cursor: pointer;
          width: 100%;
        }

        .timeline-legend {
          display: flex;
          justify-content: center;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
          font-size: 0.8rem;
          color: #888;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .medication-cards {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .med-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          border-left: 4px solid;
        }

        .med-info {
          flex: 1;
        }

        .med-info strong {
          display: block;
          color: #fff;
        }

        .med-info span {
          font-size: 0.8rem;
          color: #888;
        }

        .med-timing {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.25rem;
        }

        .med-timing .date {
          font-size: 0.75rem;
          color: #666;
        }

        .reorder-btn {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: 6px;
          color: #fff;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .reorder-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
}
