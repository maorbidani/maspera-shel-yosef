import { HEBREW_DAYS, type DayKey, type WorkingHours } from '../types';

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

export function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const dt = parseDateStr(dateStr);
  dt.setDate(dt.getDate() + days);
  return toLocalDateStr(dt);
}

export function getDayKeyFromDateStr(dateStr: string): DayKey {
  const dt = parseDateStr(dateStr);
  return String(dt.getDay()) as DayKey;
}

export function isIsraelSummerTime(dateStr: string): boolean {
  const [y] = dateStr.split('-').map(Number);
  if (!y) return false;

  const march31 = new Date(y, 2, 31, 12, 0, 0);
  const lastSundayMarch = 31 - march31.getDay();
  const dstStartStr = toLocalDateStr(new Date(y, 2, lastSundayMarch - 2, 12, 0, 0));

  const oct31 = new Date(y, 9, 31, 12, 0, 0);
  const lastSundayOct = 31 - oct31.getDay();
  const dstEndStr = toLocalDateStr(new Date(y, 9, lastSundayOct, 12, 0, 0));

  return dateStr >= dstStartStr && dateStr < dstEndStr;
}

export function getEffectiveDayHours(
  dateStr: string,
  workingHours: WorkingHours
): { open: boolean; start: string; end: string } | null {
  const key = getDayKeyFromDateStr(dateStr);
  const dayConfig = workingHours[key];
  if (!dayConfig) return null;

  if (
    key === '5' &&
    dayConfig.open &&
    dayConfig.start === '09:00' &&
    (dayConfig.end === '13:00' || dayConfig.end === '14:00')
  ) {
    return {
      open: true,
      start: '09:00',
      end: isIsraelSummerTime(dateStr) ? '14:00' : '13:00',
    };
  }

  return dayConfig;
}

export function getOpenDatesInRange(
  workingHours: WorkingHours,
  daysAhead: number,
  fromDate: Date = new Date()
): string[] {
  const safeDays = Math.max(1, Math.min(60, daysAhead || 14));
  const startStr = toLocalDateStr(fromDate);
  const openDates: string[] = [];

  for (let i = 0; i < safeDays; i++) {
    const candidate = addDaysToDateStr(startStr, i);
    const key = getDayKeyFromDateStr(candidate);
    if (workingHours[key]?.open) {
      openDates.push(candidate);
    }
  }

  return openDates;
}

export function formatHebrewFullDate(dateStr: string): string {
  const dt = parseDateStr(dateStr);
  const key = String(dt.getDay()) as DayKey;
  const dayName = HEBREW_DAYS[key]?.full ?? '';
  const dayNum = dt.getDate();
  const monthName = HEBREW_MONTHS[dt.getMonth()] ?? '';
  return `${dayName}, ${dayNum} ב${monthName}`;
}

export function formatHebrewDayChip(dateStr: string, todayStr: string): {
  topLabel: string;
  dayNum: string;
  monthShort: string;
} {
  const dt = parseDateStr(dateStr);
  const key = String(dt.getDay()) as DayKey;
  const tomorrowStr = addDaysToDateStr(todayStr, 1);

  let topLabel = HEBREW_DAYS[key]?.short ?? '';
  if (dateStr === todayStr) {
    topLabel = 'היום';
  } else if (dateStr === tomorrowStr) {
    topLabel = 'מחר';
  }

  return {
    topLabel,
    dayNum: String(dt.getDate()),
    monthShort: HEBREW_MONTHS[dt.getMonth()] ?? '',
  };
}

export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function normalizeSlotHHMM(timeValue: string): string {
  return timeValue.slice(0, 5);
}

export function toTimeWithSeconds(hhmm: string): string {
  const clean = normalizeSlotHHMM(hhmm);
  return `${clean}:00`;
}

export function generateAvailableSlots(
  dateStr: string,
  workingHours: WorkingHours,
  slotMinutes: number,
  bookedStartTimes: string[],
  now: Date = new Date()
): string[] {
  const dayConfig = getEffectiveDayHours(dateStr, workingHours);
  if (!dayConfig || !dayConfig.open) {
    return [];
  }

  const step = Math.max(10, Math.min(180, slotMinutes || 25));
  const startMin = timeToMinutes(dayConfig.start);
  const endMin = timeToMinutes(dayConfig.end);
  if (endMin <= startMin) {
    return [];
  }

  const bookedSet = new Set(bookedStartTimes.map(normalizeSlotHHMM));
  const todayStr = toLocalDateStr(now);
  const isToday = dateStr === todayStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (let t = startMin; t + step <= endMin; t += step) {
    if (isToday && t <= nowMinutes) {
      continue;
    }
    const label = minutesToHHMM(t);
    if (!bookedSet.has(label)) {
      slots.push(label);
    }
  }

  return slots;
}

export function generateAllDaySlots(
  dateStr: string,
  workingHours: WorkingHours,
  slotMinutes: number
): string[] {
  const dayConfig = getEffectiveDayHours(dateStr, workingHours);
  if (!dayConfig || !dayConfig.open) {
    return [];
  }

  const step = Math.max(10, Math.min(180, slotMinutes || 25));
  const startMin = timeToMinutes(dayConfig.start);
  const endMin = timeToMinutes(dayConfig.end);
  const slots: string[] = [];
  for (let t = startMin; t + step <= endMin; t += step) {
    slots.push(minutesToHHMM(t));
  }
  return slots;
}

export function isValidIsraeliPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return (
    (digits.startsWith('05') && digits.length === 10) ||
    (digits.startsWith('9725') && digits.length === 12) ||
    (digits.startsWith('0') && digits.length >= 9 && digits.length <= 10)
  );
}
