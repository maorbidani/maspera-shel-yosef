import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Lock, Scissors } from 'lucide-react';
import { BarberAdmin } from './components/BarberAdmin';
import { BarberPinGate } from './components/BarberPinGate';
import { CustomerBooking } from './components/CustomerBooking';
import { fetchBarbershopSettings, isSupabaseConfigured } from './lib/supabase';
import { DEFAULT_SETTINGS, type BarbershopSettings } from './types';

type AppScreen = 'customer' | 'admin';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('customer');
  const [settings, setSettings] = useState<BarbershopSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [markImgFailed, setMarkImgFailed] = useState<boolean>(false);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const data = await fetchBarbershopSettings();
      setSettings(data);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'לא ניתן לטעון את הגדרות המספרה'
      );
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    document.title = `${settings.shop_name} — זימון וניהול תורים`;
  }, [settings.shop_name]);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      {/* Compact Sticky Top Bar (56px) */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setScreen('customer')}
            className="flex items-center gap-2.5 text-right whitespace-nowrap shrink-0 focus:outline-none"
          >
            {!markImgFailed ? (
              <img
                src="/src/assets/images/barber_tools_mark_1795723783403.jpg"
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setMarkImgFailed(true)}
                className="h-8 w-8 rounded-lg object-cover border border-stone-200"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-amber-400">
                <Scissors className="h-4 w-4" />
              </span>
            )}
            <span className="font-display text-base sm:text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0">
              {settings.shop_name}
            </span>
          </button>

          <nav
            aria-label="מעבר בין מסכים"
            className="flex items-center gap-1 rounded-xl bg-stone-100 p-1 shrink-0"
          >
            <button
              type="button"
              onClick={() => setScreen('customer')}
              className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                screen === 'customer'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              הזמנת תור
            </button>
            <button
              type="button"
              onClick={() => setScreen('admin')}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                screen === 'admin'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>ניהול הספר</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        {!isSupabaseConfigured && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">נדרשת הגדרת חיבור Supabase</p>
              <p className="mt-0.5 text-xs text-amber-800">
                יש להגדיר את משתני הסביבה{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono" dir="ltr">
                  VITE_SUPABASE_URL
                </code>{' '}
                ו-
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono" dir="ltr">
                  VITE_SUPABASE_ANON_KEY
                </code>{' '}
                כדי לקרוא ולשמור תורים והגדרות.
              </p>
            </div>
          </div>
        )}

        {settingsError && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>שגיאה בחיבור למסד הנתונים: {settingsError}</span>
            <button
              type="button"
              onClick={() => void loadSettings()}
              className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-200"
            >
              נסה שוב
            </button>
          </div>
        )}

        {screen === 'customer' ? (
          <CustomerBooking settings={settings} settingsLoading={settingsLoading} />
        ) : adminToken ? (
          <BarberAdmin
            adminToken={adminToken}
            settings={settings}
            onSettingsUpdated={(next) => setSettings(next)}
            onLogout={() => setAdminToken(null)}
          />
        ) : (
          <BarberPinGate onSuccess={(token) => setAdminToken(token)} />
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white py-4 text-center text-xs text-stone-500">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <span>{settings.shop_name}</span>
          <a
            href={`tel:${settings.phone}`}
            className="hover:text-stone-900 tabular-nums"
            dir="ltr"
          >
            {settings.phone}
          </a>
        </div>
      </footer>
    </div>
  );
}
