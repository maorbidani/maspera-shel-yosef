import { useState } from 'react';
import { Delete, Lock } from 'lucide-react';

interface BarberPinGateProps {
  onSuccess: (token: string) => void;
}

export function BarberPinGate({ onSuccess }: BarberPinGateProps) {
  const [pin, setPin] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function verifyPin(candidate: string) {
    if (candidate.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setError(data.error || 'קוד PIN שגוי, נסה שוב');
        setPin('');
        return;
      }
      onSuccess(data.token);
    } catch {
      setError('שגיאת תקשורת מול השרת');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  function handleDigitPress(digit: string) {
    if (loading) return;
    setError(null);
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      void verifyPin(next);
    }
  }

  function handleBackspace() {
    if (loading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    void verifyPin(pin);
  }

  return (
    <section className="mx-auto max-w-sm py-6 sm:py-10">
      <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-900">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold text-stone-900">
            כניסה לניהול הספר
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            הזן קוד PIN בן 4 ספרות כדי לצפות ביומן ובהגדרות
          </p>
        </div>

        <form onSubmit={handleManualSubmit} className="mt-6">
          {/* PIN visual indicators */}
          <div className="flex justify-center gap-3" dir="ltr">
            {[0, 1, 2, 3].map((idx) => {
              const filled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-lg font-bold transition-colors ${
                    filled
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-200 bg-stone-50 text-stone-400'
                  }`}
                >
                  {filled ? '•' : ''}
                </div>
              );
            })}
          </div>

          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
              setPin(digits);
              setError(null);
              if (digits.length === 4) {
                void verifyPin(digits);
              }
            }}
            aria-label="קוד PIN"
            className="mt-4 h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-center text-sm tracking-[0.4em] text-stone-900 focus:border-stone-900 focus:bg-white focus:outline-none"
            placeholder="הקלד קוד PIN"
          />

          {error && (
            <p role="alert" className="mt-3 text-center text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {/* Thumb-friendly numeric keypad */}
          <div className="mt-5 grid grid-cols-3 gap-2.5" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={loading}
                onClick={() => handleDigitPress(digit)}
                className="flex min-h-[52px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 font-display text-lg font-semibold text-stone-900 transition-colors hover:bg-stone-100 active:scale-[0.96] disabled:opacity-50"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={() => {
                setPin('');
                setError(null);
              }}
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
            >
              נקה
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleDigitPress('0')}
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 font-display text-lg font-semibold text-stone-900 transition-colors hover:bg-stone-100 active:scale-[0.96] disabled:opacity-50"
            >
              0
            </button>

            <button
              type="button"
              disabled={loading || pin.length === 0}
              onClick={handleBackspace}
              aria-label="מחיקת ספרה"
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:bg-stone-300 disabled:text-stone-500"
          >
            {loading ? 'בודק קוד...' : 'כניסה לניהול'}
          </button>
        </form>
      </div>
    </section>
  );
}
