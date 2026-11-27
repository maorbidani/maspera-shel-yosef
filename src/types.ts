export type DayKey = '0' | '1' | '2' | '3' | '4' | '5' | '6';

export interface DayWorkingHours {
  open: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export type WorkingHours = Record<DayKey, DayWorkingHours>;

export interface BarbershopSettings {
  id: number;
  shop_name: string;
  phone: string;
  slot_minutes: number;
  days_ahead: number;
  working_hours: WorkingHours;
}

export type AppointmentSource = 'web' | 'manual';
export type AppointmentStatus = 'booked';

export interface Appointment {
  id: string;
  appointment_date: string; // YYYY-MM-DD
  start_time: string;       // HH:MM:SS
  customer_name: string;
  customer_phone: string;
  source: AppointmentSource;
  status: AppointmentStatus;
  created_at?: string;
}

export interface NewAppointmentInput {
  appointment_date: string;
  start_time: string; // HH:MM:SS
  customer_name: string;
  customer_phone: string;
  source: AppointmentSource;
  status?: AppointmentStatus;
}

export interface ReminderDispatchLog {
  appointmentId: string;
  customerName: string;
  customerPhone: string;
  appointmentDate: string;
  startTime: string;
  sentAt: string;
  method: 'auto_webhook' | 'manual_whatsapp';
}

export interface ReminderAutomationStatus {
  gatewayConfigured: boolean;
  supabaseConfigured: boolean;
  autoEnabled: boolean;
  sendHour: string; // "HH:MM"
  template: string;
  lastRunAt: string | null;
  lastRunSummary: string | null;
  sentIds: string[];
  logs: ReminderDispatchLog[];
}

export const BARBERSHOP_MEDIA = {
  logo: '/assets/aistudio/IMG-20261127-WA0006_ce558cab.jpg',
  gallery: [
    {
      src: '/assets/aistudio/IMG-20261127-WA0008_7dee1fd9.jpg',
      alt: 'עמדת התספורת והמראות במספרת גברים וילדים יוסף נחמני',
    },
    {
      src: '/assets/aistudio/IMG-20261127-WA0007_e29306a1.jpg',
      alt: 'חלל המספרה והתאורה המודרנית במספרת יוסף נחמני',
    },
    {
      src: '/assets/aistudio/IMG-20261127-WA0009_333a3c64.jpg',
      alt: 'מבט פנימי על עמדת הטיפוח והמראות במספרה',
    },
  ],
} as const;

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  '0': { open: true, start: '17:00', end: '21:00' },
  '1': { open: true, start: '17:00', end: '21:00' },
  '2': { open: true, start: '17:00', end: '21:00' },
  '3': { open: true, start: '17:00', end: '21:00' },
  '4': { open: true, start: '17:00', end: '23:00' },
  '5': { open: true, start: '09:00', end: '13:00' }, // 09:00-13:00 winter, 09:00-14:00 summer
  '6': { open: false, start: '09:00', end: '13:00' },
};

export const DEFAULT_SETTINGS: BarbershopSettings = {
  id: 1,
  shop_name: 'מספרת גברים וילדים יוסף נחמני',
  phone: '0500000000',
  slot_minutes: 25,
  days_ahead: 14,
  working_hours: DEFAULT_WORKING_HOURS,
};

export const HEBREW_DAYS: Record<DayKey, { full: string; short: string }> = {
  '0': { full: 'יום ראשון', short: 'א׳' },
  '1': { full: 'יום שני', short: 'ב׳' },
  '2': { full: 'יום שלישי', short: 'ג׳' },
  '3': { full: 'יום רביעי', short: 'ד׳' },
  '4': { full: 'יום חמישי', short: 'ה׳' },
  '5': { full: 'יום שישי', short: 'ו׳' },
  '6': { full: 'שבת', short: 'ש׳' },
};
