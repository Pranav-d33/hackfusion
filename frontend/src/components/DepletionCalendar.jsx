/**
 * Depletion Calendar Component
 * Premium mini-calendar that visualises medication depletion dates.
 * - Current date: underlined
 * - Depletion dates: red with medicine name below
 * - Expandable to full modal for detail
 * Matches Mediloon white-glass UI.
 */
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, ChevronLeft, ChevronRight, Pill,
  AlertTriangle, X, Maximize2, Minimize2,
} from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export default function DepletionCalendar({ timeline, loading, onReorder }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [zoomed, setZoomed] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  // Build depletion map: date-string → [{brand_name, urgency, days_until_depletion, ...}]
  const depletionMap = useMemo(() => {
    const map = {};
    if (!timeline) return map;
    timeline.forEach(pred => {
      const depDate = parseDate(pred.depletion_date);
      if (!depDate) return;
      const key = `${depDate.getFullYear()}-${depDate.getMonth()}-${depDate.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(pred);
    });
    return map;
  }, [timeline]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const getDayDepletions = (day) => {
    const key = `${year}-${month}-${day}`;
    return depletionMap[key] || [];
  };

  const isToday = (day) => isSameDay(new Date(year, month, day), today);

  // Count total depletions this month
  const monthDepletions = useMemo(() => {
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      count += getDayDepletions(d).length;
    }
    return count;
  }, [depletionMap, year, month, daysInMonth]);

  const calendarContent = (isModal = false) => {
    const cellSize = isModal ? 'h-20 sm:h-24' : 'h-10';
    const textSize = isModal ? 'text-sm' : 'text-[11px]';
    const medTextSize = isModal ? 'text-[10px]' : 'text-[8px]';

    return (
      <div className={`flex flex-col ${!isModal ? 'h-full' : ''}`}>
        {/* Header */}
        <div className={`flex items-center justify-between mb-3 ${!isModal ? 'flex-shrink-0' : ''}`}>
          <div className="flex items-center gap-2">
            <Calendar size={isModal ? 18 : 14} className="text-red-500" />
            <h3 className={`font-semibold text-gray-800 ${isModal ? 'text-base' : 'text-xs'}`}>
              {MONTHS[month]} {year}
            </h3>
            {monthDepletions > 0 && (
              <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-semibold">
                {monthDepletions} depletion{monthDepletions > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={goToday}
              className="text-[10px] text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-all duration-200 font-medium active:scale-95"
            >
              Today
            </button>
            <button onClick={prevMonth} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95">
              <ChevronLeft size={14} />
            </button>
            <button onClick={nextMonth} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95">
              <ChevronRight size={14} />
            </button>
            {!isModal && (
              <button onClick={() => setZoomed(true)} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 ml-1" title="Expand calendar">
                <Maximize2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Weekday labels */}
        <div className={`grid grid-cols-7 mb-1 ${!isModal ? 'flex-shrink-0' : ''}`}>
          {WEEKDAYS.map(d => (
            <div key={d} className={`text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-1`}>
              {d.charAt(0)}{isModal ? d.slice(1) : ''}
            </div>
          ))}
        </div>

        {/* Scrollable calendar body */}
        <div className={`${!isModal ? 'flex-1 overflow-y-auto' : ''}`}>
        {/* Days grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-100/50 rounded-xl overflow-hidden border border-gray-100">
          {/* Empty cells for alignment */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e-${i}`} className={`${cellSize} bg-white`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const deps = getDayDepletions(day);
            const hasDep = deps.length > 0;
            const todayFlag = isToday(day);
            const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const isSelected = selectedDay === day && isModal;

            return (
              <div
                key={day}
                onClick={() => isModal && hasDep && setSelectedDay(selectedDay === day ? null : day)}
                className={`
                  ${cellSize} bg-white flex flex-col items-center justify-start pt-1 relative transition-all duration-200
                  ${hasDep ? 'cursor-pointer hover:bg-red-50/50 hover:scale-105 hover:shadow-sm' : ''}
                  ${isSelected ? 'bg-red-50 ring-1 ring-red-200 scale-105' : ''}
                  ${isPast && !todayFlag ? 'opacity-40' : ''}
                `}
              >
                {/* Day number */}
                <span className={`
                  ${textSize} font-medium leading-none z-10 relative
                  ${todayFlag ? 'text-red-600 font-bold' : hasDep ? 'text-red-500 font-semibold' : 'text-gray-600'}
                `}>
                  {day}
                  {/* Underline for today */}
                  {todayFlag && (
                    <span className="absolute -bottom-0.5 left-0 right-0 h-[2px] bg-red-500 rounded-full" />
                  )}
                </span>

                {/* Depletion dot(s) */}
                {hasDep && !isModal && (
                  <div className="flex gap-0.5 mt-0.5">
                    {deps.slice(0, 3).map((dep, di) => (
                      <span
                        key={di}
                        className={`w-1.5 h-1.5 rounded-full ${
                          dep.urgency === 'critical' ? 'bg-red-500' :
                          dep.urgency === 'soon' ? 'bg-amber-500' : 'bg-rose-400'
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Medicine names in modal view */}
                {hasDep && isModal && (
                  <div className="w-full px-0.5 mt-1 space-y-0.5 overflow-hidden flex-1">
                    {deps.slice(0, 2).map((dep, di) => (
                      <div
                        key={di}
                        className={`${medTextSize} leading-tight truncate px-1 py-0.5 rounded text-center font-medium ${
                          dep.urgency === 'critical' ? 'bg-red-100 text-red-700' :
                          dep.urgency === 'soon' ? 'bg-amber-100 text-amber-700' : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {dep.brand_name}
                      </div>
                    ))}
                    {deps.length > 2 && (
                      <p className={`${medTextSize} text-gray-400 text-center`}>+{deps.length - 2} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* No depletions message */}
        {monthDepletions === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
              <Calendar size={18} className="text-emerald-400" />
            </div>
            <p className={`font-medium text-gray-500 ${isModal ? 'text-sm' : 'text-xs'}`}>No depletions this month</p>
            <p className="text-[10px] text-gray-400 mt-0.5">All your medications are well-stocked ✨</p>
          </div>
        )}

        {/* Selected day detail in modal */}
        {isModal && selectedDay && getDayDepletions(selectedDay).length > 0 && (
          <div className="mt-4 bg-red-50/50 rounded-xl border border-red-100 p-4 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-red-500" />
              <h4 className="text-xs font-semibold text-gray-800">
                Depletions on {MONTHS[month]} {selectedDay}
              </h4>
            </div>
            <div className="space-y-2">
              {getDayDepletions(selectedDay).map((dep, i) => (
                <div key={i} className="flex items-center justify-between bg-white rounded-lg p-3 border border-red-100/50">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      dep.urgency === 'critical' ? 'bg-red-100' : 'bg-amber-100'
                    }`}>
                      <Pill size={14} className={dep.urgency === 'critical' ? 'text-red-500' : 'text-amber-500'} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{dep.brand_name}</p>
                      <p className="text-[11px] text-gray-400">{dep.dosage} • {dep.days_until_depletion} day{dep.days_until_depletion !== 1 ? 's' : ''} left</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onReorder?.(dep)}
                    className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95 hover:shadow-md"
                  >
                    Reorder
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className={`flex items-center justify-center gap-4 mt-3 ${isModal ? 'text-xs' : 'text-[10px]'} text-gray-400 ${!isModal ? 'flex-shrink-0' : ''}`}>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Soon
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 border-b-2 border-red-500" /> Today
          </span>
        </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-full flex items-center justify-center">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} className="text-gray-300" />
          <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mini calendar widget - Fixed Height with Scroll */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 transition-all duration-300 hover:shadow-lg hover:border-red-100 h-full flex flex-col">
        {calendarContent(false)}
      </div>
      {/* Zoomed modal PORTAL */}
      {zoomed && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-fade-in" onClick={() => setZoomed(false)}>
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-scale-in flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center">
                  <Calendar size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Depletion Calendar</h2>
                  <p className="text-[11px] text-gray-400">Tap a date to see medicine details</p>
                </div>
              </div>
              <button
                onClick={() => setZoomed(false)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            {/* Calendar body */}
            <div className="p-6 overflow-y-auto">
              {calendarContent(true)}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
