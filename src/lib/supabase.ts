import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKING_HOURS,
  type Appointment,
  type BarbershopSettings,
  type NewAppointmentInput,
  type WorkingHours,
} from '../types';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  supabaseUrl.startsWith('http');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

function sanitizeWorkingHours(raw: unknown): WorkingHours {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_WORKING_HOURS;
  }
  const obj = raw as Record<string, unknown>;
  const result = { ...DEFAULT_WORKING_HOURS };
  (['0', '1', '2', '3', '4', '5', '6'] as const).forEach((key) => {
    const entry = obj[key];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      result[key] = {
        open: typeof e.open === 'boolean' ? e.open : DEFAULT_WORKING_HOURS[key].open,
        start: typeof e.start === 'string' && e.start ? e.start.slice(0, 5) : DEFAULT_WORKING_HOURS[key].start,
        end: typeof e.end === 'string' && e.end ? e.end.slice(0, 5) : DEFAULT_WORKING_HOURS[key].end,
      };
    }
  });
  return result;
}

export async function fetchBarbershopSettings(): Promise<BarbershopSettings> {
  if (!supabase) {
    return DEFAULT_SETTINGS;
  }

  const { data, error } = await supabase
    .from('barbershop_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    try {
      const { data: seeded } = await supabase
        .from('barbershop_settings')
        .upsert(DEFAULT_SETTINGS, { onConflict: 'id' })
        .select()
        .single();
      if (seeded) {
        return {
          id: seeded.id ?? 1,
          shop_name: seeded.shop_name || DEFAULT_SETTINGS.shop_name,
          phone: seeded.phone || DEFAULT_SETTINGS.phone,
          slot_minutes: Number(seeded.slot_minutes) || DEFAULT_SETTINGS.slot_minutes,
          days_ahead: Number(seeded.days_ahead) || DEFAULT_SETTINGS.days_ahead,
          working_hours: sanitizeWorkingHours(seeded.working_hours),
        };
      }
    } catch {
      // Ignore if RLS prevents anon seeding
    }
    return DEFAULT_SETTINGS;
  }

  // Auto-upgrade legacy placeholder values (shop_name, slot_minutes, or placeholder phone 0500000000)
  const needsLegacyNameUpgrade =
    data.shop_name === 'המספרה של יוסף' && Number(data.slot_minutes) === 30;
  const needsPhoneUpgrade = !data.phone || data.phone === '0500000000';

  if (needsLegacyNameUpgrade || needsPhoneUpgrade) {
    const upgraded: BarbershopSettings = {
      id: 1,
      shop_name: needsLegacyNameUpgrade
        ? DEFAULT_SETTINGS.shop_name
        : data.shop_name || DEFAULT_SETTINGS.shop_name,
      phone: needsPhoneUpgrade ? DEFAULT_SETTINGS.phone : data.phone,
      slot_minutes: needsLegacyNameUpgrade
        ? DEFAULT_SETTINGS.slot_minutes
        : Number(data.slot_minutes) || DEFAULT_SETTINGS.slot_minutes,
      days_ahead: Number(data.days_ahead) || DEFAULT_SETTINGS.days_ahead,
      working_hours: needsLegacyNameUpgrade
        ? DEFAULT_WORKING_HOURS
        : sanitizeWorkingHours(data.working_hours),
    };
    try {
      await supabase
        .from('barbershop_settings')
        .upsert(upgraded, { onConflict: 'id' });
    } catch {
      // Return upgraded settings even if write is restricted
    }
    return upgraded;
  }

  return {
    id: data.id ?? 1,
    shop_name: data.shop_name || DEFAULT_SETTINGS.shop_name,
    phone: data.phone || DEFAULT_SETTINGS.phone,
    slot_minutes: Number(data.slot_minutes) || DEFAULT_SETTINGS.slot_minutes,
    days_ahead: Number(data.days_ahead) || DEFAULT_SETTINGS.days_ahead,
    working_hours: sanitizeWorkingHours(data.working_hours),
  };
}

export async function saveBarbershopSettings(
  settings: BarbershopSettings
): Promise<BarbershopSettings> {
  if (!supabase) {
    throw new Error('חיבור Supabase אינו מוגדר עדיין');
  }

  const payload = {
    id: 1,
    shop_name: settings.shop_name.trim(),
    phone: settings.phone.trim(),
    slot_minutes: Number(settings.slot_minutes) || DEFAULT_SETTINGS.slot_minutes,
    days_ahead: Number(settings.days_ahead) || DEFAULT_SETTINGS.days_ahead,
    working_hours: settings.working_hours,
  };

  const { data, error } = await supabase
    .from('barbershop_settings')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data.id ?? 1,
    shop_name: data.shop_name,
    phone: data.phone,
    slot_minutes: Number(data.slot_minutes) || DEFAULT_SETTINGS.slot_minutes,
    days_ahead: Number(data.days_ahead) || DEFAULT_SETTINGS.days_ahead,
    working_hours: sanitizeWorkingHours(data.working_hours),
  };
}

export async function fetchAppointmentsByDate(dateStr: string): Promise<Appointment[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('appointment_date', dateStr)
    .eq('status', 'booked')
    .order('start_time', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Appointment[];
}

export async function createAppointment(input: NewAppointmentInput): Promise<Appointment> {
  if (!supabase) {
    throw new Error('חיבור Supabase אינו מוגדר עדיין');
  }

  const { data: existing, error: checkError } = await supabase
    .from('appointments')
    .select('id')
    .eq('appointment_date', input.appointment_date)
    .eq('start_time', input.start_time)
    .eq('status', 'booked')
    .maybeSingle();

  if (checkError) {
    throw new Error(checkError.message);
  }

  if (existing) {
    throw new Error('השעה שבחרת כבר נתפסה. אנא בחר שעה אחרת.');
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      appointment_date: input.appointment_date,
      start_time: input.start_time,
      customer_name: input.customer_name.trim(),
      customer_phone: input.customer_phone.trim(),
      source: input.source,
      status: input.status ?? 'booked',
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Appointment;
}

export async function deleteAppointment(id: string): Promise<void> {
  if (!supabase) {
    throw new Error('חיבור Supabase אינו מוגדר עדיין');
  }

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAllAppointments(): Promise<void> {
  if (!supabase) {
    throw new Error('חיבור Supabase אינו מוגדר עדיין');
  }

  const { error } = await supabase
    .from('appointments')
    .delete()
    .not('id', 'is', null);

  if (error) {
    throw new Error(error.message);
  }
}

export function subscribeToBarbershopChanges(
  onSettingsChange: () => void,
  onAppointmentsChange: () => void
): () => void {
  if (!supabase) {
    return () => {};
  }

  const client = supabase;
  const channel = client
    .channel('barbershop-live-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'barbershop_settings' },
      () => onSettingsChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appointments' },
      () => onAppointmentsChange()
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
