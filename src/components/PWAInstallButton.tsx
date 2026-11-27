import { useState } from 'react';
import { Download, MoreVertical, PlusSquare, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  label?: string;
  modalTitle?: string;
}

export function PWAInstallButton({
  className = '',
  label = 'התקן את האפליקציה',
  modalTitle = 'התקנת האפליקציה למסך הבית',
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    if (isInstallable) {
      const outcome = await install();
      if (outcome !== 'unavailable') {
        return;
      }
    }
    setShowGuideModal(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-stone-900 shadow-xs transition-colors hover:bg-stone-50 active:scale-[0.98] whitespace-nowrap ${className}`}
      >
        <Download className="h-4 w-4 shrink-0 text-amber-700" />
        <span>{label}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="pwa-install-title"
                className="font-display text-lg font-bold text-stone-900"
              >
                {modalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="סגור"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <p className="text-stone-600">
                  כדי להתקין את האפליקציה באייפון (Safari):
                </p>
                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-stone-900 border border-stone-200">
                    <Share className="h-4 w-4" />
                  </span>
                  <p className="leading-relaxed">
                    1. לחץ על <strong>כפתור השיתוף</strong> (הריבוע עם החץ למעלה) בסרגל של Safari.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-stone-900 border border-stone-200">
                    <PlusSquare className="h-4 w-4" />
                  </span>
                  <p className="leading-relaxed">
                    2. גלול מטה ובחר <strong>״הוסף אל מסך הבית״</strong> ולאחר מכן לחץ <strong>״הוסף״</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <p className="text-stone-600">
                  כדי להתקין את האפליקציה בדפדפן Chrome / Android:
                </p>
                <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-stone-900 border border-stone-200">
                    <MoreVertical className="h-4 w-4" />
                  </span>
                  <p className="leading-relaxed">
                    לחץ על תפריט הדפדפן (שלוש הנקודות) ובחר <strong>״התקן אפליקציה״</strong> או <strong>״הוסף למסך הבית״</strong>.
                  </p>
                </div>
                <p className="text-xs text-stone-500">
                  באייפון (Safari): לחץ על כפתור השיתוף (הריבוע עם החץ למעלה) ואז בחר ״הוסף אל מסך הבית״.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
            >
              הבנתי, סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
}
