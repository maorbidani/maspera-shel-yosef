import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { BARBERSHOP_MEDIA } from '../types';

interface BarberAuthGateProps {
  shopName: string;
  onSuccess: (accessToken: string) => void;
}

export function BarberAuthGate({ shopName, onSuccess }: BarberAuthGateProps) {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      setError('חיבור Supabase אינו מוגדר בסביבה זו.');
      return;
    }

    if (!email.trim() || !password) {
      setError('יש להזין אימייל וסיסמה.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('invalid login credentials')) {
          setError('אימייל או סיסמה שגויים.');
        } else if (authError.message.toLowerCase().includes('email not confirmed')) {
          setError('כתובת האימייל טרם אומתה ב-Supabase.');
        } else {
          setError(authError.message);
        }
        return;
      }

      const token = data.session?.access_token;
      if (!token) {
        setError('לא התקבל אסימון התחברות מ-Supabase.');
        return;
      }

      onSuccess(token);
    } catch {
      setError('אירעה שגיאה בהתחברות מול Supabase.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-md py-6 sm:py-12">
      <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <img
            src={BARBERSHOP_MEDIA.logo}
            alt={shopName}
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full object-cover ring-2 ring-amber-500/40 bg-stone-950"
          />
          <h1 className="mt-4 font-display text-xl sm:text-2xl font-bold text-stone-900">
            כניסה לניהול הספר
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {shopName} · אימות מאובטח מול Supabase Auth
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="barber-email"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              אימייל
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                id="barber-email"
                type="email"
                required
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yosef@example.com"
                className="h-12 w-full rounded-xl border border-stone-300 bg-white pr-10 pl-3.5 text-right text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="barber-password"
              className="mb-1.5 block text-sm font-medium text-stone-700"
            >
              סיסמה
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                id="barber-password"
                type={showPassword ? 'text' : 'password'}
                required
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-xl border border-stone-300 bg-white pr-10 pl-11 text-right text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500"
          >
            {loading ? 'מאמת מול Supabase...' : 'התחברות למערכת הניהול'}
          </button>
        </form>
      </div>
    </section>
  );
}
