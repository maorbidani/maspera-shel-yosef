import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  MapPin,
  Phone,
  Scissors,
  User,
} from 'lucide-react';
import {
  addDaysToDateStr,
  formatHebrewDayChip,
  formatHebrewFullDate,
  generateAvailableSlots,
  getEffectiveDayHours,
  getOpenDatesInRange,
  isIsraelSummerTime,
  isValidIsraeliPhone,
  toLocalDateStr,
  toTimeWithSeconds,
} from '../lib/dateUtils';
import {
  createAppointment,
  fetchAppointmentsByDate,
  isSupabaseConfigured,
} from '../lib/supabase';
import {
  BARBERSHOP_ADDRESS,
  BARBERSHOP_MEDIA,
  BARBERSHOP_PRICES,
  type Appointment,
  type BarbershopSettings,
} from '../types';

interface CustomerBookingProps {
  settings: BarbershopSettings;
  settingsLoading: boolean;
  appointmentsVersion: number;
}

export function CustomerBooking({
  settings,
  settingsLoading,
  appointmentsVersion,
}: CustomerBookingProps) {
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const openDates = useMemo(
    () => getOpenDatesInRange(settings.working_hours, settings.days_ahead, new Date()),
    [settings.working_hours, settings.days_ahead]
  );

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [autoReturnSeconds, setAutoReturnSeconds] = useState<number | null>(null);
  const [autoReturnPaused, setAutoReturnPaused] = useState<boolean>(false);

  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [failedPhotos, setFailedPhotos] = useState<Record<number, boolean>>({});
  const [logoFailed, setLogoFailed] = useState<boolean>(false);

  useEffect(() => {
    if (openDates.length > 0 && (!selectedDate || !openDates.includes(selectedDate))) {
      setSelectedDate(openDates[0]);
    }
  }, [openDates, selectedDate]);

  useEffect(() => {
    if (!selectedDate) return;
    let active = true;

    async function loadDayAppointments() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const rows = await fetchAppointmentsByDate(selectedDate);
        if (!active) return;
        const times = rows.map((r) => r.start_time);
        setBookedTimes(times);
        setSelectedSlot((prev) =>
          prev && times.some((t) => t.slice(0, 5) === prev) ? '' : prev
        );
      } catch (err) {
        if (!active) return;
        setSlotsError(
          err instanceof Error ? err.message : 'לא הצלחנו לטעון את השעות הפנויות'
        );
        setBookedTimes([]);
      } finally {
        if (active) setSlotsLoading(false);
      }
    }

    void loadDayAppointments();
    return () => {
      active = false;
    };
  }, [selectedDate, appointmentsVersion]);

  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    return generateAvailableSlots(
      selectedDate,
      settings.working_hours,
      settings.slot_minutes,
      bookedTimes,
      new Date()
    );
  }, [selectedDate, settings.working_hours, settings.slot_minutes, bookedTimes]);

  const selectedDayHours = useMemo(() => {
    if (!selectedDate) return null;
    return getEffectiveDayHours(selectedDate, settings.working_hours);
  }, [selectedDate, settings.working_hours]);

  const nextAvailableDate = useMemo(() => {
    if (!selectedDate || openDates.length <= 1) return null;
    const idx = openDates.indexOf(selectedDate);
    if (idx >= 0 && idx + 1 < openDates.length) {
      return openDates[idx + 1];
    }
    return null;
  }, [openDates, selectedDate]);

  const isSummerNow = useMemo(() => isIsraelSummerTime(todayStr), [todayStr]);

  const fridayHours = settings.working_hours['5'];
  const sunHours = settings.working_hours['0'];
  const thuHours = settings.working_hours['4'];
  const isStandardFridaySchedule =
    fridayHours?.open &&
    fridayHours.start === '09:00' &&
    (fridayHours.end === '13:00' || fridayHours.end === '14:00');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!isSupabaseConfigured) {
      setFormError('יש להגדיר את משתני הסביבה של Supabase לפני שמירת תורים.');
      return;
    }
    if (!selectedDate || !selectedSlot) {
      setFormError('יש לבחור תאריך ושעה פנויה.');
      return;
    }
    if (customerName.trim().length < 2) {
      setFormError('יש להזין שם מלא (לפחות 2 תווים).');
      return;
    }
    if (!isValidIsraeliPhone(customerPhone)) {
      setFormError('יש להזין מספר טלפון ישראלי תקין (למשל 052-7138795).');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createAppointment({
        appointment_date: selectedDate,
        start_time: toTimeWithSeconds(selectedSlot),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        source: 'web',
        status: 'booked',
      });
      setConfirmedAppointment(created);
      setAutoReturnPaused(false);
      setAutoReturnSeconds(5);
      setBookedTimes((prev) => [...prev, created.start_time]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'אירעה שגיאה בקביעת התור.');
      try {
        const refreshed = await fetchAppointmentsByDate(selectedDate);
        setBookedTimes(refreshed.map((r) => r.start_time));
      } catch {
        // ignore refresh error
      }
    } finally {
      setSubmitting(false);
    }
  }

  const handleReturnHome = useCallback(() => {
    setConfirmedAppointment(null);
    setSelectedDate(openDates[0] ?? '');
    setSelectedSlot('');
    setCustomerName('');
    setCustomerPhone('');
    setFormError(null);
    setAutoReturnSeconds(null);
    setAutoReturnPaused(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [openDates]);

  useEffect(() => {
    if (!confirmedAppointment || autoReturnPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setAutoReturnSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(timer);
          handleReturnHome();
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [confirmedAppointment, autoReturnPaused, handleReturnHome]);

  if (confirmedAppointment) {
    const confirmedTimeShort = confirmedAppointment.start_time.slice(0, 5);
    const fullHebrewDate = formatHebrewFullDate(confirmedAppointment.appointment_date);

    return (
      <section className="mx-auto max-w-xl py-4 sm:py-8">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-stone-900 text-balance">
              קביעת התור נשמרה בהצלחה
            </h1>
            <p className="mt-1.5 text-sm text-stone-500">
              מחכים לך ב{settings.shop_name}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs sm:text-sm font-semibold text-amber-900">
              <Clock className="h-4 w-4 shrink-0 text-amber-700" />
              <span>קביעת התור נשמרה — נא לא לאחר ולהגיע בזמן</span>
            </div>
          </div>

          <div className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-stone-50/60 px-5">
            <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
              <span className="text-stone-500">כתובת המספרה</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
                <MapPin className="h-4 w-4 shrink-0 text-amber-700" />
                <span>{BARBERSHOP_ADDRESS}</span>
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5 text-sm">
              <span className="text-stone-500">תאריך</span>
              <span className="font-semibold text-stone-900">{fullHebrewDate}</span>
            </div>
            <div className="flex items-center justify-between py-3.5 text-sm">
              <span className="text-stone-500">שעה</span>
              <span className="font-bold text-stone-900 tabular-nums text-base">
                {confirmedTimeShort}
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5 text-sm">
              <span className="text-stone-500">משך משוער</span>
              <span className="font-medium text-stone-800 tabular-nums">
                {settings.slot_minutes} דקות
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5 text-sm">
              <span className="text-stone-500">שם הלקוח</span>
              <span className="font-semibold text-stone-900">
                {confirmedAppointment.customer_name}
              </span>
            </div>
            <div className="flex items-center justify-between py-3.5 text-sm">
              <span className="text-stone-500">טלפון</span>
              <span className="font-medium text-stone-900 tabular-nums" dir="ltr">
                {confirmedAppointment.customer_phone}
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleReturnHome}
              className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:scale-[0.99]"
            >
              <Home className="h-5 w-5 shrink-0" />
              <span>חזרה לדף הבית</span>
            </button>

            <a
              href={`tel:${settings.phone}`}
              onClick={() => setAutoReturnPaused(true)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-50 active:scale-[0.99]"
            >
              <Phone className="h-4 w-4 shrink-0 text-stone-700" />
              <span>יצירת קשר עם הספר</span>
              <span className="tabular-nums text-stone-600" dir="ltr">
                ({settings.phone})
              </span>
            </a>
          </div>

          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-center text-xs sm:text-sm text-stone-700 leading-relaxed">
            במקרה של אי יכולת הגעה אל התור, נא לבטל את התור דרך{' '}
            <a
              href={`tel:${settings.phone}`}
              onClick={() => setAutoReturnPaused(true)}
              className="font-semibold text-stone-900 underline underline-offset-2 hover:text-amber-800"
            >
              יצירת קשר עם הספר ({settings.phone})
            </a>
            .
          </div>

          {!autoReturnPaused && autoReturnSeconds !== null && autoReturnSeconds > 0 && (
            <p className="mt-3 text-center text-xs text-stone-500 tabular-nums">
              מועבר אוטומטית לדף הבית בעוד {autoReturnSeconds} שניות...
            </p>
          )}
        </div>
      </section>
    );
  }

  const currentPhoto = BARBERSHOP_MEDIA.gallery[activePhotoIndex] ?? BARBERSHOP_MEDIA.gallery[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
      {/* Right Column in RTL: Shop Hero + Gallery + Opening Hours + Price List + Step 1 Date Picker */}
      <div className="space-y-6 lg:col-span-5">
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white">
          <div className="relative aspect-[16/10] w-full bg-stone-900">
            {!failedPhotos[activePhotoIndex] ? (
              <img
                src={currentPhoto.src}
                alt={currentPhoto.alt}
                referrerPolicy="no-referrer"
                onError={() =>
                  setFailedPhotos((prev) => ({ ...prev, [activePhotoIndex]: true }))
                }
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-stone-800 to-stone-950 text-stone-200">
                <Scissors className="h-10 w-10 text-amber-400" />
                <span className="mt-2 font-display text-lg font-bold">
                  {settings.shop_name}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3.5 p-4 sm:p-5 text-white">
              {!logoFailed && (
                <img
                  src={BARBERSHOP_MEDIA.logo}
                  alt={`לוגו ${settings.shop_name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-amber-400/80 shadow-md bg-stone-950"
                />
              )}
              <div className="min-w-0">
                <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-balance leading-snug">
                  {settings.shop_name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-stone-200">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-amber-400" />
                    <span>{BARBERSHOP_ADDRESS}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>תור של {settings.slot_minutes} דקות</span>
                  {selectedDayHours?.open && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        פתוח {selectedDayHours.start}–{selectedDayHours.end}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 3-Photo Space Gallery Switcher */}
          <div className="grid grid-cols-3 gap-2 border-b border-stone-100 bg-stone-50/70 p-2.5">
            {BARBERSHOP_MEDIA.gallery.map((photo, index) => {
              const isActive = index === activePhotoIndex;
              return (
                <button
                  key={photo.src}
                  type="button"
                  onClick={() => setActivePhotoIndex(index)}
                  aria-label={`תמונת מספרה ${index + 1}`}
                  aria-pressed={isActive}
                  className={`relative aspect-[16/10] overflow-hidden rounded-xl border transition-all ${
                    isActive
                      ? 'border-stone-900 ring-2 ring-stone-900/20'
                      : 'border-stone-200 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </button>
              );
            })}
          </div>

          {/* Official Opening Hours Details */}
          <div className="border-b border-stone-100 px-5 py-4">
            <h2 className="text-xs font-bold text-stone-500">שעות פעילות</h2>
            <dl className="mt-2.5 space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-stone-600">ימים א׳–ד׳</dt>
                <dd className="font-semibold tabular-nums text-stone-900">
                  {sunHours?.open ? `${sunHours.start}–${sunHours.end}` : 'סגור'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-stone-600">יום ה׳</dt>
                <dd className="font-semibold tabular-nums text-stone-900">
                  {thuHours?.open ? `${thuHours.start}–${thuHours.end}` : 'סגור'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-stone-600">יום שישי</dt>
                <dd className="font-semibold tabular-nums text-stone-900 text-left">
                  {isStandardFridaySchedule ? (
                    <span>
                      {isSummerNow ? '09:00–14:00 (קיץ)' : '09:00–13:00 (חורף)'}
                      <span className="block text-[11px] font-normal text-stone-500">
                        חורף 09:00–13:00 · קיץ 09:00–14:00
                      </span>
                    </span>
                  ) : fridayHours?.open ? (
                    `${fridayHours.start}–${fridayHours.end}`
                  ) : (
                    'סגור'
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-stone-600">שבת</dt>
                <dd className="text-stone-500">סגור</dd>
              </div>
            </dl>
          </div>

          {/* Price List */}
          <div className="border-b border-stone-100 px-5 py-4">
            <h2 className="text-xs font-bold text-stone-500">מחירון</h2>
            <dl className="mt-2.5 space-y-2 text-sm">
              {BARBERSHOP_PRICES.map((item) => (
                <div
                  key={item.service}
                  className="flex items-center justify-between gap-4"
                >
                  <dt className="text-stone-700">{item.service}</dt>
                  <dd className="font-bold tabular-nums text-stone-900" dir="ltr">
                    {item.price}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Barbershop Address */}
          <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-3.5 text-sm">
            <span className="text-stone-600">כתובת המספרה</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
              <MapPin className="h-4 w-4 shrink-0 text-amber-700" />
              <span>{BARBERSHOP_ADDRESS}</span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
            <span className="text-stone-600">יצירת קשר טלפונית</span>
            <a
              href={`tel:${settings.phone}`}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-stone-100 px-3.5 py-1.5 text-sm font-semibold text-stone-900 hover:bg-stone-200 whitespace-nowrap"
            >
              <Phone className="h-4 w-4 text-stone-700" />
              <span>התקשר לספר</span>
              <span className="tabular-nums text-stone-600" dir="ltr">
                {settings.phone}
              </span>
            </a>
          </div>
        </div>

        {/* Step 1: Select Date */}
        <section className="rounded-3xl border border-stone-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-stone-900">
              1. בחירת יום
            </h2>
            {selectedDate && (
              <span className="text-xs font-medium text-stone-500">
                {formatHebrewFullDate(selectedDate)}
              </span>
            )}
          </div>

          {settingsLoading ? (
            <div className="mt-4 flex gap-2.5 overflow-hidden">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 w-16 shrink-0 animate-pulse rounded-2xl bg-stone-100"
                />
              ))}
            </div>
          ) : openDates.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-center text-sm text-stone-600">
              אין ימים פתוחים להזמנה בטווח הימים הקרוב.
            </div>
          ) : (
            <div className="no-scrollbar mt-4 flex gap-2.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {openDates.map((dateStr) => {
                const chip = formatHebrewDayChip(dateStr, todayStr);
                const isSelected = selectedDate === dateStr;
                const isTomorrow = dateStr === addDaysToDateStr(todayStr, 1);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setSelectedSlot('');
                    }}
                    aria-pressed={isSelected}
                    className={`flex min-h-[76px] min-w-[68px] shrink-0 flex-col items-center justify-center rounded-2xl border px-3 py-2.5 transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                        : 'border-stone-200 bg-stone-50/70 text-stone-800 hover:border-stone-400 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`text-[11px] font-medium ${
                        isSelected
                          ? 'text-amber-300'
                          : isTomorrow
                          ? 'text-amber-700'
                          : 'text-stone-500'
                      }`}
                    >
                      {chip.topLabel}
                    </span>
                    <span className="mt-0.5 text-lg font-bold tabular-nums leading-tight">
                      {chip.dayNum}
                    </span>
                    <span
                      className={`text-[11px] ${
                        isSelected ? 'text-stone-300' : 'text-stone-500'
                      }`}
                    >
                      {chip.monthShort}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Left Column in RTL: Step 2 Time Slots + Step 3 Booking Form */}
      <div className="space-y-6 lg:col-span-7">
        {/* Step 2: Available Time Slots */}
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-stone-900">
              2. בחירת שעה פנויה
            </h2>
            {!slotsLoading && selectedDate && (
              <span className="text-xs text-stone-500 tabular-nums">
                {availableSlots.length > 0
                  ? `${availableSlots.length} שעות פנויות (${settings.slot_minutes} דק׳)`
                  : 'אין שעות פנויות'}
              </span>
            )}
          </div>

          {slotsError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {slotsError}
            </div>
          )}

          {slotsLoading ? (
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-xl bg-stone-100"
                />
              ))}
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-6 text-center">
              <Clock className="mx-auto h-7 w-7 text-stone-400" />
              <p className="mt-2 text-sm font-semibold text-stone-800">
                לא נותרו שעות פנויות ליום זה
              </p>
              <p className="mt-1 text-xs text-stone-500">
                כל השעות תפוסות או שכבר חלפו להיום.
              </p>
              {nextAvailableDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(nextAvailableDate);
                    setSelectedSlot('');
                  }}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800"
                >
                  <Calendar className="h-4 w-4" />
                  <span>מעבר ליום הפתוח הבא ({formatHebrewFullDate(nextAvailableDate)})</span>
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
              {availableSlots.map((slot) => {
                const isSelected = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[46px] items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                        : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Step 3: Customer Details Form */}
        <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-stone-900">
              3. פרטים לסיום ההזמנה
            </h2>
            {selectedDate && selectedSlot && (
              <span className="text-xs font-semibold text-amber-800 tabular-nums">
                {formatHebrewFullDate(selectedDate)} · שעה {selectedSlot}
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="customer-name"
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  שם מלא
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    id="customer-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="ישראל ישראלי"
                    autoComplete="name"
                    className="h-12 w-full rounded-xl border border-stone-300 bg-white pr-10 pl-3.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="customer-phone"
                  className="mb-1.5 block text-sm font-medium text-stone-700"
                >
                  מספר טלפון נייד
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    id="customer-phone"
                    type="tel"
                    inputMode="tel"
                    required
                    dir="ltr"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="050-1234567"
                    autoComplete="tel"
                    className="h-12 w-full rounded-xl border border-stone-300 bg-white pr-10 pl-3.5 text-right text-sm tabular-nums text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !selectedSlot || !selectedDate}
              className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              {submitting ? (
                <span>שומר את התור...</span>
              ) : selectedSlot ? (
                <span>
                  אישור וקביעת תור לשעה <span className="tabular-nums">{selectedSlot}</span>
                </span>
              ) : (
                <span>בחר שעה כדי להמשיך</span>
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
