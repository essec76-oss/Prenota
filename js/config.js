// ============================================================
// config.js — Costanti globali
// ============================================================

export const SUPABASE_URL = 'https://smwtbonxhvhrnyukrluw.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hEooIlJGPblzlaUbdO_ssA_wKEz6I-B';
export const SUPABASE_TABLE = 'Tennis';
export const CLEANUP_DAYS = 7;
export const PAST_SLOT_MARGIN_MINUTES = 10;

export const FIELDS = {
  tennis: {
    key: 'tennis',
    label: 'Campo da tennis',
    color: '--tennis',
    colorSoft: '--tennis-soft',
    slotMinutes: 60,
    start: 7,
    end: 23,
    minNames: 1,
    maxNames: 4
  },
  padel: {
    key: 'padel',
    label: 'Campo da padel',
    color: '--padel',
    colorSoft: '--padel-soft',
    slotMinutes: 90,
    start: 6.5,
    end: 23,
    minNames: 4,
    maxNames: 4
  }
};

export const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
