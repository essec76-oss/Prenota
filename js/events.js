// ============================================================
// events.js — Tutti gli event listener dell'app
// ============================================================

import { state } from './state.js';
import { copiaLink, closeModal, showToast } from './utils.js';
import { handleLogin, handleLogout } from './auth.js';
import { switchField } from './ui.js';
import { goPrevMonth, goNextMonth, setupCalendarSwipe, updateBookingDots, renderCalendar } from './calendar.js';
import { renderSlots } from './slots.js';
import { openGuestRegisterModal, loadGuestSlotsCounter } from './guest.js';
import { mostraFormRichiestaContatto } from './richieste-contatto.js';

export function setupEventListeners() {
  // ---------- QR CODE ----------
  const qrImg = document.getElementById('login-qr-code');
  if (qrImg) {
    const link = window.location.href;
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(link);
  }
  loadGuestSlotsCounter();

  // ---------- LOGIN ----------
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);

  const loginCodice = document.getElementById('login-codice');
  if (loginCodice) {
    loginCodice.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleLogin();
    });
  }

  // ---------- LOGOUT ----------
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // ---------- COPIA LINK ----------
  const copyBtn = document.getElementById('login-copy-link-btn');
  if (copyBtn) copyBtn.addEventListener('click', copiaLink);

  // ---------- TABS TENNIS/PADEL ----------
  const tabTennis = document.getElementById('tab-tennis');
  const tabPadel = document.getElementById('tab-padel');
  if (tabTennis) tabTennis.addEventListener('click', function () { switchField('tennis'); });
  if (tabPadel) tabPadel.addEventListener('click', function () { switchField('padel'); });

  // ---------- MESE PRECEDENTE / SUCCESSIVO ----------
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');
  if (prevBtn) prevBtn.addEventListener('click', goPrevMonth);
  if (nextBtn) nextBtn.addEventListener('click', goNextMonth);

  // ---------- SWIPE CALENDARIO ----------
  setupCalendarSwipe();

  // ---------- CLEAN BTN ----------
  const cleanBtn = document.getElementById('clean-btn');
  if (cleanBtn) {
    cleanBtn.addEventListener('click', async function () {
      if (!state.loggedUser || !state.loggedUser.is_admin || !state.loggedUser.accessToken) {
        showToast('🔑 La pulizia delle prenotazioni richiede sessione admin attiva.');
        return;
      }
      const { deleteOldBookings } = await import('./api.js');
      const { dateKey } = await import('./utils.js');
      const cutoffDateObj = new Date();
      cutoffDateObj.setDate(cutoffDateObj.getDate() - 7);
      const cutoffDate = dateKey(cutoffDateObj);
      await deleteOldBookings(cutoffDate, state.loggedUser.accessToken);
      showToast('🧹 Prenotazioni vecchie cancellate!');
      updateBookingDots();
      renderSlots();
    });
  }

  // ---------- GUEST REGISTRATION ----------
  const guestBtn = document.getElementById('guest-register-btn');
  if (guestBtn) guestBtn.addEventListener('click', openGuestRegisterModal);

  // ---------- RICHIESTA CONTATTO ----------
  const richiestaLink = document.getElementById('link-richiesta-contatto');
  if (richiestaLink) {
    richiestaLink.addEventListener('click', function (e) {
      e.preventDefault();
      mostraFormRichiestaContatto(null);
    });
  }
}

export function updateCleanBtnVisibility() {
  const btn = document.getElementById('clean-btn');
  if (btn) btn.style.display = (state.loggedUser && state.loggedUser.is_admin) ? 'inline-block' : 'none';
}
