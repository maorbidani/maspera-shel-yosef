import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, MessageCircle, Scissors } from 'lucide-react';
import { BarberAdmin } from './components/BarberAdmin';
import { BarberAuthGate } from './components/BarberAuthGate';
import { CustomerBooking } from './components/CustomerBooking';
import { PWAInstallButton } from './components/PWAInstallButton';
import { buildWhatsAppUrl } from './lib/dateUtils';
import {
  fetchBarbershopSettings,
  isSupabaseConfigured,
  subscribeToBarbershopChanges,
  supabase,
} from './lib/supabase';
import { BARBERSHOP_MEDIA, DEFAULT_SETTINGS, type BarbershopSettings } from './types';

export const BARBER_MANAGE_PATH = '/yosef-manage-7492';

function isBarberManageRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === BARBER_MANAGE_PATH;
}

export default function App() {
  const isBarberRoute =
    typeof window !== 'undefined' ? isBarberManageRoute(window.location.pathname) : false;

  const [settings, setSettings] = useState<BarbershopSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [appointmentsVersion, setAppointmentsVersion] = useState<number>(0);

  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(isBarberRoute);
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const [copiedCustomerLink, setCopiedCustomerLink] = useState<boolean>(false);

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

  // Real-time & window-focus synchronization across customer and barber links
  useEffect(() => {
    const unsubscribeRealtime = subscribeToBarbershopChanges(
      () => {
        void loadSettings();
      },
      () => {
        setAppointmentsVersion((v) => v + 1);
      }
    );

    const handleFocus = () => {
      void loadSettings();
      setAppointmentsVersion((v) => v + 1);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribeRealtime();
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadSettings]);

  // Check and subscribe to Supabase Auth session ONLY on the dedicated barber route
  useEffect(() => {
    if (!isBarberRoute || !supabase) {
      setAuthChecking(false);
      return;
    }

    let active = true;
    const client = supabase;

    async function initSession() {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setAdminToken(data.session?.access_token ?? null);
      } finally {
        if (active) setAuthChecking(false);
      }
    }

    void initSession();

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAdminToken(session?.access_token ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [isBarberRoute]);

  useEffect(() => {
    document.title = isBarberRoute
      ? `ניהול יומן — ${settings.shop_name}`
      : `${settings.shop_name} — זימון תורים`;
  }, [isBarberRoute, settings.shop_name]);

  async function handleBarberLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAdminToken(null);
  }

  async function handleCopyCustomerUrl() {
    const url = `${window.location.origin}/`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCustomerLink(true);
      setTimeout(() => setCopiedCustomerLink(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      {/* Compact Sticky Top Bar (56px) */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {!logoFailed ? (
              <img
                src={BARBERSHOP_MEDIA.logo}
                alt={settings.shop_name}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="h-9 w-9 shrink-0 rounded-full object-cover border border-amber-500/50 bg-stone-950"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-amber-400">
                <Scissors className="h-4 w-4" />
              </span>
            )}
            <span className="font-display text-sm sm:text-base font-bold tracking-tight text-stone-900 truncate">
              {settings.shop_name}
            </span>
          </div>

          {isBarberRoute ? (
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <span className="hidden sm:inline text-xs font-semibold text-stone-500 whitespace-nowrap">
                ממשק ניהול ספר
              </span>
              <button
                type="button"
                onClick={() => void handleCopyCustomerUrl()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 whitespace-nowrap shrink-0"
              >
                {copiedCustomerLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
                    <span>הקישור הועתק</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>קישור ללקוחות</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <a
              href={buildWhatsAppUrl(
                settings.phone,
                `שלום, אשמח לתאם תור ב${settings.shop_name}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 whitespace-nowrap shrink-0"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>וואטסאפ לספר</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6 sm:py-7">
        {/* PWA Install Prompt Action Row (Hidden automatically when already installed in standalone mode) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 empty:hidden">
          <PWAInstallButton />
        </div>

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

        {isBarberRoute ? (
          authChecking ? (
            <div className="mx-auto max-w-md py-12">
              <div className="h-64 animate-pulse rounded-3xl border border-stone-200 bg-white" />
            </div>
          ) : adminToken ? (
            <BarberAdmin
              adminToken={adminToken}
              settings={settings}
              appointmentsVersion={appointmentsVersion}
              onSettingsUpdated={(next) => setSettings(next)}
              onLogout={() => void handleBarberLogout()}
            />
          ) : (
            <BarberAuthGate
              shopName={settings.shop_name}
              onSuccess={(token) => setAdminToken(token)}
            />
          )
        ) : (
          <CustomerBooking
            settings={settings}
            settingsLoading={settingsLoading}
            appointmentsVersion={appointmentsVersion}
          />
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
