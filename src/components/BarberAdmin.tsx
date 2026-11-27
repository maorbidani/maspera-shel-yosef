import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogOut,
  MessageCircle,
  Phone,
  Plus,
  Send,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import {
  addDaysToDateStr,
  buildWhatsAppUrl,
  formatHebrewFullDate,
  formatReminderMessage,
  generateAllDaySlots,
  isValidIsraeliPhone,
  normalizeSlotHHMM,
  toLocalDateStr,
  toTimeWithSeconds,
} from '../lib/dateUtils';
import {
  createAppointment,
  deleteAllAppointments,
  deleteAppointment,
  fetchAppointmentsByDate,
  isSupabaseConfigured,
  saveBarbershopSettings,
} from '../lib/supabase';
import {
  DEFAULT_SETTINGS,
  HEBREW_DAYS,
  type Appointment,
  type BarbershopSettings,
  type DayKey,
  type ReminderAutomationStatus,
} from '../types';

type AdminTab = 'appointments' | 'reminders' | 'settings';
type ResetModalStep = 'warning' | 'final' | null;

interface BarberAdminProps {
  adminToken: string;
  settings: BarbershopSettings;
  appointmentsVersion: number;
  onSettingsUpdated: (next: BarbershopSettings) => void;
  onLogout: () => void;
}

export function BarberAdmin({
  adminToken,
  settings,
  appointmentsVersion,
  onSettingsUpdated,
  onLogout,
}: BarberAdminProps) {
  const todayStr = useMemo(() => toLocalDateStr(new Date()), []);
  const tomorrowStr = useMemo(() => addDaysToDateStr(todayStr, 1), [todayStr]);

  const [activeTab, setActiveTab] = useState<AdminTab>('appointments');

  // --- Appointments tab state ---
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState<boolean>(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [appointmentsSuccess, setAppointmentsSuccess] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Double-confirmation reset all appointments state
  const [resetModalStep, setResetModalStep] = useState<ResetModalStep>(null);
  const [resetConfirmedCheck, setResetConfirmedCheck] = useState<boolean>(false);
  const [resettingAll, setResettingAll] = useState<boolean>(false);

  // Manual appointment form state
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualTime, setManualTime] = useState<string>('');
  const [manualName, setManualName] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [manualSaving, setManualSaving] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // --- Identity quick-save state (Shop Name & Phone) ---
  const [identityName, setIdentityName] = useState<string>(settings.shop_name);
  const [identityPhone, setIdentityPhone] = useState<string>(settings.phone);
  const [savingIdentity, setSavingIdentity] = useState<boolean>(false);
  const [identityFeedback, setIdentityFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // --- Full Settings tab state ---
  const [draftSettings, setDraftSettings] = useState<BarbershopSettings>(settings);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // --- Reminders tab state ---
  const [tomorrowAppointments, setTomorrowAppointments] = useState<Appointment[]>([]);
  const [loadingTomorrow, setLoadingTomorrow] = useState<boolean>(false);
  const [reminderStatus, setReminderStatus] = useState<ReminderAutomationStatus | null>(null);
  const [reminderTemplate, setReminderTemplate] = useState<string>(
    'שלום {name}, תזכורת לתור שלך מחר ב{shop} בשעה {time}. נתראה!'
  );
  const [autoEnabled, setAutoEnabled] = useState<boolean>(true);
  const [sendHour, setSendHour] = useState<string>('18:00');
  const [savingReminderCfg, setSavingReminderCfg] = useState<boolean>(false);
  const [runningReminders, setRunningReminders] = useState<boolean>(false);
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraftSettings(settings);
    setIdentityName(settings.shop_name);
    setIdentityPhone(settings.phone);
  }, [settings]);

  const loadAppointments = useCallback(async (dateStr: string) => {
    setLoadingAppointments(true);
    setAppointmentsError(null);
    try {
      const rows = await fetchAppointmentsByDate(dateStr);
      setAppointments(rows);
    } catch (err) {
      setAppointmentsError(
        err instanceof Error ? err.message : 'שגיאה בטעינת רשימת התורים'
      );
      setAppointments([]);
    } finally {
      setLoadingAppointments(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'appointments') {
      void loadAppointments(selectedDate);
    }
  }, [activeTab, selectedDate, appointmentsVersion, loadAppointments]);

  const loadRemindersData = useCallback(async () => {
    setLoadingTomorrow(true);
    try {
      const [apts, statusRes] = await Promise.all([
        fetchAppointmentsByDate(tomorrowStr),
        fetch('/api/admin/reminders/status', {
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
      ]);
      setTomorrowAppointments(apts);
      if (statusRes.status === 401) {
        onLogout();
        return;
      }
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as ReminderAutomationStatus;
        setReminderStatus(statusData);
        setAutoEnabled(statusData.autoEnabled);
        setSendHour(statusData.sendHour);
        setReminderTemplate(statusData.template);
      }
    } catch {
      // ignore transient error
    } finally {
      setLoadingTomorrow(false);
    }
  }, [tomorrowStr, adminToken, onLogout]);

  useEffect(() => {
    if (activeTab === 'reminders') {
      void loadRemindersData();
    }
  }, [activeTab, appointmentsVersion, loadRemindersData]);

  const manualSlotOptions = useMemo(() => {
    const allSlots = generateAllDaySlots(
      selectedDate,
      settings.working_hours,
      settings.slot_minutes
    );
    const taken = new Set(appointments.map((a) => normalizeSlotHHMM(a.start_time)));
    return allSlots.filter((s) => !taken.has(s));
  }, [selectedDate, settings.working_hours, settings.slot_minutes, appointments]);

  async function handleDeleteAppointment(id: string) {
    setDeletingId(id);
    setAppointmentsSuccess(null);
    try {
      await deleteAppointment(id);
      setAppointments((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setAppointmentsError(
        err instanceof Error ? err.message : 'לא ניתן לבטל את התור'
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResetAllAppointments() {
    if (!resetConfirmedCheck) return;
    setResettingAll(true);
    setAppointmentsError(null);
    setAppointmentsSuccess(null);
    try {
      await deleteAllAppointments();
      setAppointments([]);
      setTomorrowAppointments([]);
      setResetModalStep(null);
      setResetConfirmedCheck(false);
      setAppointmentsSuccess('כל התורים אופסו ונמחקו מ-Supabase בהצלחה.');
    } catch (err) {
      setAppointmentsError(
        err instanceof Error ? err.message : 'אירעה שגיאה באיפוס כל התורים.'
      );
      setResetModalStep(null);
      setResetConfirmedCheck(false);
    } finally {
      setResettingAll(false);
    }
  }

  async function handleAddManualAppointment(e: React.FormEvent) {
    e.preventDefault();
    setManualError(null);
    setAppointmentsSuccess(null);

    if (!isSupabaseConfigured) {
      setManualError('יש להגדיר את חיבור Supabase לפני שמירת תורים.');
      return;
    }
    if (!manualTime) {
      setManualError('יש לבחור או להזין שעה.');
      return;
    }
    if (manualName.trim().length < 2) {
      setManualError('יש להזין שם לקוח.');
      return;
    }
    if (!isValidIsraeliPhone(manualPhone)) {
      setManualError('יש להזין מספר טלפון תקין.');
      return;
    }

    setManualSaving(true);
    try {
      const created = await createAppointment({
        appointment_date: selectedDate,
        start_time: toTimeWithSeconds(manualTime),
        customer_name: manualName.trim(),
        customer_phone: manualPhone.trim(),
        source: 'manual',
        status: 'booked',
      });
      setAppointments((prev) =>
        [...prev, created].sort((a, b) => a.start_time.localeCompare(b.start_time))
      );
      setShowManualForm(false);
      setManualName('');
      setManualPhone('');
      setManualTime('');
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'שגיאה בהוספת התור');
    } finally {
      setManualSaving(false);
    }
  }

  async function handleSaveIdentity(e: React.FormEvent) {
    e.preventDefault();
    setIdentityFeedback(null);

    if (identityName.trim().length < 2) {
      setIdentityFeedback({ type: 'error', text: 'יש להזין שם מספרה תקין.' });
      return;
    }
    if (!isValidIsraeliPhone(identityPhone)) {
      setIdentityFeedback({
        type: 'error',
        text: 'יש להזין מספר טלפון תקין (למשל 0527138795).',
      });
      return;
    }

    setSavingIdentity(true);
    try {
      const merged: BarbershopSettings = {
        ...draftSettings,
        shop_name: identityName.trim(),
        phone: identityPhone.trim(),
      };
      const saved = await saveBarbershopSettings(merged);
      setDraftSettings(saved);
      onSettingsUpdated(saved);
      setIdentityFeedback({
        type: 'success',
        text: 'שם המספרה והטלפון נשמרו ועודכנו מיד בעמוד הלקוחות.',
      });
    } catch (err) {
      setIdentityFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'שגיאה בשמירת פרטי המספרה',
      });
    } finally {
      setSavingIdentity(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsFeedback(null);
    setSavingSettings(true);
    try {
      const saved = await saveBarbershopSettings({
        ...draftSettings,
        shop_name: identityName.trim() || draftSettings.shop_name,
        phone: identityPhone.trim() || draftSettings.phone,
      });
      onSettingsUpdated(saved);
      setSettingsFeedback({
        type: 'success',
        text: 'ההגדרות נשמרו בהצלחה ב-Supabase.',
      });
    } catch (err) {
      setSettingsFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'שגיאה בשמירת ההגדרות',
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveReminderConfig() {
    setSavingReminderCfg(true);
    setReminderFeedback(null);
    try {
      const res = await fetch('/api/admin/reminders/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          autoEnabled,
          sendHour,
          template: reminderTemplate,
        }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.ok) {
        setReminderFeedback('הגדרות התזכורות האוטומטיות עודכנו.');
      }
    } catch {
      setReminderFeedback('שגיאה בעדכון הגדרות התזכורות.');
    } finally {
      setSavingReminderCfg(false);
    }
  }

  async function handleRunRemindersNow() {
    setRunningReminders(true);
    setReminderFeedback(null);
    try {
      const res = await fetch('/api/admin/reminders/run', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      const data = (await res.json()) as {
        summary?: string;
        sentIds?: string[];
        logs?: ReminderAutomationStatus['logs'];
      };
      if (data.summary) {
        setReminderFeedback(data.summary);
      }
      setReminderStatus((prev) =>
        prev
          ? {
              ...prev,
              sentIds: data.sentIds ?? prev.sentIds,
              logs: data.logs ?? prev.logs,
              lastRunAt: new Date().toISOString(),
              lastRunSummary: data.summary ?? prev.lastRunSummary,
            }
          : prev
      );
    } catch {
      setReminderFeedback('שגיאה בהפעלת מנגנון התזכורות.');
    } finally {
      setRunningReminders(false);
    }
  }

  async function handleMarkReminderSent(apt: Appointment) {
    try {
      const res = await fetch('/api/admin/reminders/mark-sent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          appointmentId: apt.id,
          customerName: apt.customer_name,
          customerPhone: apt.customer_phone,
          appointmentDate: apt.appointment_date,
          startTime: apt.start_time,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          sentIds: string[];
          logs: ReminderAutomationStatus['logs'];
        };
        setReminderStatus((prev) =>
          prev
            ? { ...prev, sentIds: data.sentIds, logs: data.logs }
            : {
                gatewayConfigured: false,
                supabaseConfigured: isSupabaseConfigured,
                autoEnabled,
                sendHour,
                template: reminderTemplate,
                lastRunAt: null,
                lastRunSummary: null,
                sentIds: data.sentIds,
                logs: data.logs,
              }
        );
      }
    } catch {
      // ignore error
    }
  }

  const sentIdsSet = useMemo(
    () => new Set(reminderStatus?.sentIds ?? []),
    [reminderStatus?.sentIds]
  );

  return (
    <div className="space-y-5">
      {/* Workspace Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs sm:text-sm text-stone-600">
          <span className="font-semibold text-stone-900">{settings.shop_name}</span>
          <span className="mx-2 text-stone-300" aria-hidden="true">
            ·
          </span>
          <span className="tabular-nums" dir="ltr">
            {settings.phone}
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 hover:text-stone-900 whitespace-nowrap"
        >
          <LogOut className="h-4 w-4" />
          <span>התנתקות</span>
        </button>
      </div>

      {/* Full-Width 3-Tab Switcher (No horizontal clipping on RTL mobile) */}
      <nav
        aria-label="לשוניות ניהול"
        className="grid grid-cols-3 gap-1.5 rounded-2xl border border-stone-200 bg-white p-1.5"
      >
        <button
          type="button"
          onClick={() => setActiveTab('appointments')}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm font-semibold leading-tight transition-colors ${
            activeTab === 'appointments'
              ? 'bg-stone-900 text-white'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <Calendar className="h-4 w-4 shrink-0" />
          <span>יומן תורים</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reminders')}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm font-semibold leading-tight transition-colors ${
            activeTab === 'reminders'
              ? 'bg-stone-900 text-white'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <Bell className="h-4 w-4 shrink-0" />
          <span>תזכורות WhatsApp</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm font-semibold leading-tight transition-colors ${
            activeTab === 'settings'
              ? 'bg-stone-900 text-white'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>הגדרות מספרה</span>
        </button>
      </nav>

      {/* TAB 1: APPOINTMENTS */}
      {activeTab === 'appointments' && (
        <div className="space-y-5">
          {/* Date Controls & Add Manual CTA */}
          <div className="flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(addDaysToDateStr(selectedDate, -1))}
                aria-label="יום קודם"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                aria-label="בחר תאריך"
                className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
              />

              <button
                type="button"
                onClick={() => setSelectedDate(addDaysToDateStr(selectedDate, 1))}
                aria-label="יום הבא"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                  selectedDate === todayStr
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                היום
              </button>

              <button
                type="button"
                onClick={() => setSelectedDate(tomorrowStr)}
                className={`min-h-[44px] rounded-xl px-3.5 text-xs font-semibold transition-colors ${
                  selectedDate === tomorrowStr
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                מחר
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowManualForm((v) => !v);
                setManualError(null);
                if (!manualTime && manualSlotOptions.length > 0) {
                  setManualTime(manualSlotOptions[0]);
                }
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
            >
              {showManualForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{showManualForm ? 'סגור טופס' : 'הוספת תור ידני'}</span>
            </button>
          </div>

          {/* Inline Add Manual Appointment Form */}
          {showManualForm && (
            <form
              onSubmit={handleAddManualAppointment}
              className="rounded-3xl border border-stone-300 bg-white p-5 sm:p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-stone-900">
                  הוספת תור ידני (טלפוני) — {formatHebrewFullDate(selectedDate)}
                </h2>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                    שעה
                  </label>
                  {manualSlotOptions.length > 0 ? (
                    <select
                      value={manualTime}
                      onChange={(e) => setManualTime(e.target.value)}
                      className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                    >
                      <option value="">בחר שעה פנויה...</option>
                      {manualSlotOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="time"
                      value={manualTime}
                      onChange={(e) => setManualTime(e.target.value)}
                      className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                    שם הלקוח
                  </label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="שם מלא"
                    className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                    טלפון הלקוח
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    required
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="050-0000000"
                    className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-right text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                  />
                </div>
              </div>

              {manualError && (
                <p className="mt-3 text-sm font-medium text-red-700">{manualError}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="min-h-[44px] rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={manualSaving}
                  className="min-h-[44px] rounded-xl bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:bg-stone-300"
                >
                  {manualSaving ? 'שומר...' : 'שמור תור ידני'}
                </button>
              </div>
            </form>
          )}

          {/* Appointments List */}
          <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">
                  {formatHebrewFullDate(selectedDate)}
                </h2>
                <p className="mt-0.5 text-xs text-stone-500 tabular-nums">
                  סה״כ {appointments.length} תורים רשומים
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setResetConfirmedCheck(false);
                  setResetModalStep('warning');
                }}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>איפוס כל התורים</span>
              </button>
            </div>

            {appointmentsSuccess && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
              >
                {appointmentsSuccess}
              </div>
            )}

            {appointmentsError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {appointmentsError}
              </div>
            )}

            {loadingAppointments ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-2xl bg-stone-100"
                  />
                ))}
              </div>
            ) : appointments.length === 0 ? (
              <div className="py-12 text-center">
                <Clock className="mx-auto h-8 w-8 text-stone-300" />
                <p className="mt-2 text-sm font-semibold text-stone-800">
                  אין תורים מוזמנים לתאריך זה
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  ניתן להוסיף תור ידני ללקוח שהתקשר באמצעות הכפתור למעלה.
                </p>
              </div>
            ) : (
              <div className="mt-2 divide-y divide-stone-100">
                {appointments.map((apt) => {
                  const timeShort = normalizeSlotHHMM(apt.start_time);
                  const isConfirming = confirmDeleteId === apt.id;
                  const isDeleting = deletingId === apt.id;

                  return (
                    <div
                      key={apt.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-4 sm:items-center">
                        <div className="flex h-12 min-w-[68px] items-center justify-center rounded-xl bg-stone-100 font-display text-base font-bold tabular-nums text-stone-900">
                          {timeShort}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-bold text-stone-900">
                              {apt.customer_name}
                            </span>
                            <span className="text-xs text-stone-400" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs font-medium text-stone-500">
                              {apt.source === 'manual' ? 'הזנה ידנית' : 'הזמנה מהאתר'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-sm text-stone-600">
                            <a
                              href={`tel:${apt.customer_phone}`}
                              className="inline-flex items-center gap-1 hover:text-stone-900 tabular-nums"
                              dir="ltr"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              <span>{apt.customer_phone}</span>
                            </a>
                            <span className="text-stone-300" aria-hidden="true">
                              ·
                            </span>
                            <a
                              href={buildWhatsAppUrl(
                                apt.customer_phone,
                                `שלום ${apt.customer_name}, הודעה מ${settings.shop_name} לגבי התור שלך בתאריך ${formatHebrewFullDate(apt.appointment_date)} בשעה ${timeShort}.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              <span>WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        {isConfirming ? (
                          <>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void handleDeleteAppointment(apt.id)}
                              className="min-h-[40px] rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {isDeleting ? 'מוחק...' : 'אישור ביטול'}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[40px] rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                            >
                              חזרה
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(apt.id)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>ביטול תור</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: AUTOMATIC WHATSAPP REMINDERS */}
      {activeTab === 'reminders' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-stone-900">
              תזכורות אוטומטיות יום לפני התור
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              המערכת בודקת מדי יום את התורים למחר ומכינה או שולחת תזכורות ללקוחות ב-WhatsApp.
            </p>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    תזמון שליחה אוטומטי
                  </p>
                  <p className="text-xs text-stone-500">
                    {reminderStatus?.gatewayConfigured
                      ? 'שער WhatsApp API מחובר ומופעל בשרת'
                      : 'מצב שליחה מהירה בלחיצה (ללא שער API חיצוני)'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoEnabled}
                  onClick={() => setAutoEnabled((v) => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    autoEnabled ? 'bg-stone-900' : 'bg-stone-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      autoEnabled ? '-translate-x-6' : '-translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                  שעת שליחה קבועה (יום לפני התור)
                </label>
                <input
                  type="time"
                  value={sendHour}
                  onChange={(e) => setSendHour(e.target.value)}
                  className="h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                  נוסח הודעת התזכורת
                </label>
                <textarea
                  rows={3}
                  value={reminderTemplate}
                  onChange={(e) => setReminderTemplate(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-900 focus:border-stone-900 focus:outline-none"
                />
                <p className="mt-1 text-xs text-stone-400">
                  משתנים זמינים: {'{name}'} · {'{shop}'} · {'{time}'} · {'{date}'}
                </p>
              </div>

              {reminderFeedback && (
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs font-medium text-stone-800">
                  {reminderFeedback}
                </div>
              )}

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={savingReminderCfg}
                  onClick={() => void handleSaveReminderConfig()}
                  className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 hover:bg-stone-50 disabled:opacity-50"
                >
                  {savingReminderCfg ? 'שומר...' : 'שמור הגדרות תזכורת'}
                </button>

                <button
                  type="button"
                  disabled={runningReminders}
                  onClick={() => void handleRunRemindersNow()}
                  className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>
                    {runningReminders ? 'מריץ בדיקה ושליחה...' : 'הפעל סבב תזכורות למחר עכשיו'}
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900">
                  תורי מחר לתזכורת — {formatHebrewFullDate(tomorrowStr)}
                </h2>
                <p className="mt-0.5 text-xs text-stone-500 tabular-nums">
                  {tomorrowAppointments.length} לקוחות מתוכננים למחר
                </p>
              </div>
            </div>

            {loadingTomorrow ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-100" />
                ))}
              </div>
            ) : tomorrowAppointments.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-stone-300" />
                <p className="mt-2 text-sm font-semibold text-stone-800">
                  אין תורים מוזמנים למחר
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  כשלקוחות יזמינו תור למחר, הם יופיעו כאן אוטומטית לשליחת תזכורת.
                </p>
              </div>
            ) : (
              <div className="mt-2 divide-y divide-stone-100">
                {tomorrowAppointments.map((apt) => {
                  const timeShort = normalizeSlotHHMM(apt.start_time);
                  const alreadySent = sentIdsSet.has(apt.id);
                  const msg = formatReminderMessage(reminderTemplate, {
                    name: apt.customer_name,
                    shop: settings.shop_name,
                    time: timeShort,
                    date: formatHebrewFullDate(apt.appointment_date),
                  });
                  const waHref = buildWhatsAppUrl(apt.customer_phone, msg);

                  return (
                    <div
                      key={apt.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base font-bold tabular-nums text-stone-900">
                            {timeShort}
                          </span>
                          <span className="text-stone-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-semibold text-stone-900">
                            {apt.customer_name}
                          </span>
                          <span className="text-stone-300" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              alreadySent ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {alreadySent ? 'תזכורת נשלחה' : 'ממתין לשליחה'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 line-clamp-2">{msg}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void handleMarkReminderSent(apt)}
                          className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                            alreadySent
                              ? 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                              : 'bg-emerald-700 text-white hover:bg-emerald-800'
                          }`}
                        >
                          <MessageCircle className="h-4 w-4" />
                          <span>{alreadySent ? 'שלח שוב' : 'שלח בוואטסאפ'}</span>
                        </a>

                        {!alreadySent && (
                          <button
                            type="button"
                            onClick={() => void handleMarkReminderSent(apt)}
                            title="סמן כנשלח"
                            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: BARBERSHOP SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Dedicated Shop Name & Phone Quick-Edit Section */}
          <form
            onSubmit={handleSaveIdentity}
            className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-7"
          >
            <div className="border-b border-stone-100 pb-4">
              <h2 className="font-display text-lg font-bold text-stone-900">
                פרטי המספרה וטלפון ליצירת קשר
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                עדכן את שם המספרה ואת מספר הטלפון של הספר (ברירת מחדל 0527138795) לחיוג ולוואטסאפ.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="identity-shop-name"
                  className="mb-1.5 block text-xs font-semibold text-stone-600"
                >
                  שם המספרה
                </label>
                <input
                  id="identity-shop-name"
                  type="text"
                  required
                  value={identityName}
                  onChange={(e) => {
                    setIdentityName(e.target.value);
                    setDraftSettings((prev) => ({ ...prev, shop_name: e.target.value }));
                  }}
                  className="h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-medium text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="identity-barber-phone"
                  className="mb-1.5 block text-xs font-semibold text-stone-600"
                >
                  טלפון הספר (לחיוג ו-WhatsApp)
                </label>
                <input
                  id="identity-barber-phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  required
                  value={identityPhone}
                  onChange={(e) => {
                    setIdentityPhone(e.target.value);
                    setDraftSettings((prev) => ({ ...prev, phone: e.target.value }));
                  }}
                  placeholder="0527138795"
                  className="h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-right text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>
            </div>

            {identityFeedback && (
              <div
                role="status"
                className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                  identityFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {identityFeedback.text}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={savingIdentity}
                className="min-h-[46px] w-full rounded-xl bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:bg-stone-300 sm:w-auto"
              >
                {savingIdentity ? 'שומר שינויים...' : 'שמור שינויים'}
              </button>
            </div>
          </form>

          {/* Working Hours & Scheduling Settings */}
          <form
            onSubmit={handleSaveSettings}
            className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-7"
          >
            <div className="border-b border-stone-100 pb-4">
              <h2 className="font-display text-lg font-bold text-stone-900">
                יומן, משך תור ושעות פעילות
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                השינויים נשמרים ישירות לטבלת barbershop_settings ומתעדכנים מיד בעמוד הלקוחות.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                  משך תור (דקות)
                </label>
                <select
                  value={draftSettings.slot_minutes}
                  onChange={(e) =>
                    setDraftSettings((prev) => ({
                      ...prev,
                      slot_minutes: Number(e.target.value) || 25,
                    }))
                  }
                  className="h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                >
                  {[15, 20, 25, 30, 40, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} דק׳
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-stone-600">
                  ימים קדימה לפתיחת יומן
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={draftSettings.days_ahead}
                  onChange={(e) =>
                    setDraftSettings((prev) => ({
                      ...prev,
                      days_ahead: Math.max(1, Math.min(60, Number(e.target.value) || 14)),
                    }))
                  }
                  className="h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-display text-base font-bold text-stone-900">
                שעות עבודה לפי ימי השבוע
              </h3>

              <div className="mt-3 divide-y divide-stone-100 rounded-2xl border border-stone-200">
                {(['0', '1', '2', '3', '4', '5', '6'] as DayKey[]).map((dayKey) => {
                  const dayCfg = draftSettings.working_hours[dayKey];
                  return (
                    <div
                      key={dayKey}
                      className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center justify-between sm:w-44">
                        <span className="text-sm font-semibold text-stone-900">
                          {HEBREW_DAYS[dayKey].full}
                        </span>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={dayCfg.open}
                          onClick={() =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              working_hours: {
                                ...prev.working_hours,
                                [dayKey]: { ...dayCfg, open: !dayCfg.open },
                              },
                            }))
                          }
                          className={`inline-flex min-h-[34px] items-center rounded-lg px-3 text-xs font-semibold transition-colors ${
                            dayCfg.open
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {dayCfg.open ? 'פתוח' : 'סגור'}
                        </button>
                      </div>

                      {dayCfg.open ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-500">מ-</span>
                            <input
                              type="time"
                              value={dayCfg.start}
                              onChange={(e) =>
                                setDraftSettings((prev) => ({
                                  ...prev,
                                  working_hours: {
                                    ...prev.working_hours,
                                    [dayKey]: { ...dayCfg, start: e.target.value },
                                  },
                                }))
                              }
                              className="h-10 rounded-xl border border-stone-300 bg-white px-2.5 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-stone-500">עד-</span>
                            <input
                              type="time"
                              value={dayCfg.end}
                              onChange={(e) =>
                                setDraftSettings((prev) => ({
                                  ...prev,
                                  working_hours: {
                                    ...prev.working_hours,
                                    [dayKey]: { ...dayCfg, end: e.target.value },
                                  },
                                }))
                              }
                              className="h-10 rounded-xl border border-stone-300 bg-white px-2.5 text-sm tabular-nums text-stone-900 focus:border-stone-900 focus:outline-none"
                            />
                          </div>

                          {dayKey === '5' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftSettings((prev) => ({
                                    ...prev,
                                    working_hours: {
                                      ...prev.working_hours,
                                      '5': { open: true, start: '09:00', end: '13:00' },
                                    },
                                  }))
                                }
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  dayCfg.end === '13:00'
                                    ? 'bg-stone-900 text-white'
                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                }`}
                              >
                                חורף (13:00)
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftSettings((prev) => ({
                                    ...prev,
                                    working_hours: {
                                      ...prev.working_hours,
                                      '5': { open: true, start: '09:00', end: '14:00' },
                                    },
                                  }))
                                }
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  dayCfg.end === '14:00'
                                    ? 'bg-stone-900 text-white'
                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                }`}
                              >
                                קיץ (14:00)
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400">יום מנוחה — המספרה סגורה</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {settingsFeedback && (
              <div
                role="status"
                className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${
                  settingsFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {settingsFeedback.text}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setDraftSettings(DEFAULT_SETTINGS);
                  setIdentityName(DEFAULT_SETTINGS.shop_name);
                  setIdentityPhone(DEFAULT_SETTINGS.phone);
                  setSettingsFeedback(null);
                }}
                className="min-h-[44px] rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                טען הגדרות ברירת מחדל (25 דק׳ ושעות רשמיות)
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="min-h-[48px] w-full rounded-xl bg-stone-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:bg-stone-300 sm:w-auto"
              >
                {savingSettings ? 'שומר הגדרות...' : 'שמור הגדרות מספרה'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Double-Confirmation Modal for "איפוס כל התורים" */}
      {resetModalStep && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => {
            if (!resettingAll) {
              setResetModalStep(null);
              setResetConfirmedCheck(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h2
                  id="reset-modal-title"
                  className="font-display text-lg font-bold text-stone-900"
                >
                  {resetModalStep === 'warning'
                    ? 'אזהרה: איפוס כל התורים'
                    : 'אישור סופי למחיקת כל התורים'}
                </h2>
                <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                  {resetModalStep === 'warning'
                    ? 'פעולה זו תמחק לצמיתות את כל התורים הקיימים ביומן (היום, מחר וכל הימים העתידיים) ממסד הנתונים ב-Supabase. לא ניתן לבטל או לשחזר לאחר המחיקה.'
                    : 'הנך עומד למחוק את כל התורים במספרה לצמיתות. אנא אשר כי ברצונך להמשיך.'}
                </p>
              </div>
            </div>

            {resetModalStep === 'final' && (
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-3.5 text-sm font-medium text-red-900">
                <input
                  type="checkbox"
                  checked={resetConfirmedCheck}
                  onChange={(e) => setResetConfirmedCheck(e.target.checked)}
                  className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span>אני מאשר מחיקה סופית של כל התורים מ-Supabase</span>
              </label>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={resettingAll}
                onClick={() => {
                  setResetModalStep(null);
                  setResetConfirmedCheck(false);
                }}
                className="min-h-[44px] rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                ביטול
              </button>

              {resetModalStep === 'warning' ? (
                <button
                  type="button"
                  onClick={() => setResetModalStep('final')}
                  className="min-h-[44px] rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  המשך לאישור סופי
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!resetConfirmedCheck || resettingAll}
                  onClick={() => void handleResetAllAppointments()}
                  className="min-h-[44px] rounded-xl bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {resettingAll ? 'מוחק את כל התורים...' : 'מחק את כל התורים לצמיתות'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
