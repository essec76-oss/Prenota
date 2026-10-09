// ============================================================
// calendar.js — Calendario mensile + pallini prenotazioni + swipe
// ============================================================

import { DOW, MONTHS } from './config.js';
import { state } from './state.js';
import { dateKey } from './utils.js';
import { loadMonthDates } from './api.js';

export function renderDow() {
  document.getElementById('cal-dow').innerHTML =
    DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');
}

export function renderMonthNav() {
  const viewMonth = state.viewMonth;
  const baseMonth = state.baseMonth;
  const maxMonth = state.maxMonth;

  document.getElementById('month-label').textContent =
    MONTHS[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();

  document.getElementById('prev-month').disabled =
    (viewMonth.getFullYear() === baseMonth.getFullYear() && viewMonth.getMonth() === baseMonth.getMonth());

  document.getElementById('next-month').disabled =
    (viewMonth.getFullYear() === maxMonth.getFullYear() && viewMonth.getMonth() === maxMonth.getMonth());
}

export function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const viewMonth = state.viewMonth;
  const today = state.today;
  const selectedDate = state.selectedDate;

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day empty';
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const thisDate = new Date(year, month, d);
    const key = dateKey(thisDate);
    const isPast = thisDate < today;

    const cell = document.createElement('button');
    cell.className = 'cal-day' + (isPast ? ' past' : '') + (key === selectedDate ? ' selected' : '');
    cell.textContent = d;
    cell.disabled = isPast;
    cell.dataset.date = key;

    if (!isPast) {
      cell.addEventListener('click', () => {
        state.selectedDate = key;
        renderCalendar();
        // import dinamico per evitare cicli
        import('./slots.js').then(m => m.renderSlots());
      });
    }
    grid.appendChild(cell);
  }

  renderMonthNav();
  updateBookingDots();
}

export async function updateBookingDots() {
  const year = state.viewMonth.getFullYear();
  const month = state.viewMonth.getMonth();
  const { pad } = await import('./utils.js');
  const bookingCounts = await loadMonthDates(state.currentField, year, month, pad);

  document.querySelectorAll('.cal-day[data-date]').forEach(cell => {
    const date = cell.dataset.date;
    const info = bookingCounts.get(date) || { count: 0, torneo: false, allenamento: false };
    const count = info.count;

    if (count > 0) {
      cell.classList.add('has-booking');
      cell.setAttribute('data-count', count);
      let badge = cell.querySelector('.booking-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'booking-count';
        cell.appendChild(badge);
      }
      badge.textContent = count;
    } else {
      cell.classList.remove('has-booking');
      const badge = cell.querySelector('.booking-count');
      if (badge) badge.remove();
      cell.removeAttribute('data-count');
    }
    cell.classList.toggle('has-torneo', !!info.torneo);
    cell.classList.toggle('has-allenamento', !!info.allenamento);
  });
}

export function goPrevMonth() {
  const viewMonth = state.viewMonth;
  const baseMonth = state.baseMonth;
  if (viewMonth.getFullYear() === baseMonth.getFullYear() && viewMonth.getMonth() === baseMonth.getMonth()) return;
  state.viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  renderCalendar();
}

export function goNextMonth() {
  const viewMonth = state.viewMonth;
  const maxMonth = state.maxMonth;
  if (viewMonth.getFullYear() === maxMonth.getFullYear() && viewMonth.getMonth() === maxMonth.getMonth()) return;
  state.viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  renderCalendar();
}

export function setupCalendarSwipe() {
  const calGrid = document.getElementById('cal-grid');
  if (!calGrid) return;
  let touchStartX = 0, touchStartY = 0;

  calGrid.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  calGrid.addEventListener('touchend', function (e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;

    const viewMonth = state.viewMonth;
    const baseMonth = state.baseMonth;
    const maxMonth = state.maxMonth;

    if (dx < 0) {
      if (!(viewMonth.getFullYear() === maxMonth.getFullYear() && viewMonth.getMonth() === maxMonth.getMonth())) {
        state.viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
        renderCalendar();
      }
    } else {
      if (!(viewMonth.getFullYear() === baseMonth.getFullYear() && viewMonth.getMonth() === baseMonth.getMonth())) {
        state.viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
        renderCalendar();
      }
    }
  }, { passive: true });
}
