import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

export type ConfirmVariant = 'primary' | 'danger' | 'warning';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

type Resolver = (value: boolean) => void;

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export const useConfirm = (): ((options: ConfirmOptions) => Promise<boolean>) => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return ctx.confirm;
};

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [options, settle]);

  const variant = options?.variant ?? 'primary';
  const Icon = variant === 'danger' ? AlertCircle : variant === 'warning' ? AlertTriangle : null;
  const iconClass =
    variant === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : variant === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : '';
  const confirmButtonVariant: 'primary' | 'secondary' = variant === 'danger' ? 'secondary' : 'primary';
  const confirmButtonClass = variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' : '';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4"
          onClick={() => settle(false)}
          role="dialog"
          aria-modal="true"
        >
          <Card
            className="max-w-md w-full"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              {Icon && <Icon className={`w-6 h-6 flex-shrink-0 mt-0.5 ${iconClass}`} />}
              <div className="flex-1 min-w-0">
                {options.title && (
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                    {options.title}
                  </h2>
                )}
                <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line break-words">
                  {options.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button ref={cancelButtonRef} variant="outline" onClick={() => settle(false)}>
                {options.cancelLabel || t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant={confirmButtonVariant}
                className={confirmButtonClass}
                onClick={() => settle(true)}
              >
                {options.confirmLabel || t('common.confirm', 'Confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};
