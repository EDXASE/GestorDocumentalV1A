import type { ReactNode } from 'react';
import { cn, initials } from '../lib/utils';

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={cn('card', className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="font-display text-lg font-700 text-ink-900">{title}</h2>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  icon?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'ink';
}) {
  const toneMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
    ink: 'bg-ink-100 text-ink-700',
  };
  return (
    <Card className="p-5 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-600 uppercase tracking-wide text-ink-500">{label}</p>
          <p className="font-display text-2xl font-700 text-ink-900 mt-1.5">{value}</p>
          {delta && (
            <p
              className={cn(
                'text-xs font-600 mt-1.5 inline-flex items-center gap-1',
                delta.positive ? 'text-emerald-600' : 'text-rose-600'
              )}
            >
              {delta.positive ? '▲' : '▼'} {delta.value}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', toneMap[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function Avatar({
  name,
  color,
  size = 36,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-600 shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? '#1e6091',
        fontSize: size * 0.36,
      }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

export function Badge({
  children,
  tone = 'ink',
  className,
}: {
  children: ReactNode;
  tone?: 'ink' | 'brand' | 'success' | 'warning' | 'danger' | 'muted';
  className?: string;
}) {
  const toneMap: Record<string, string> = {
    ink: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-rose-50 text-rose-700',
    muted: 'bg-ink-50 text-ink-500',
  };
  return <span className={cn('chip', toneMap[tone], className)}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && <div className="text-ink-300 mb-3">{icon}</div>}
      <p className="font-display font-600 text-ink-700">{title}</p>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-block h-4 w-4 rounded-full border-2 border-ink-200 border-t-brand-600 animate-spin',
        className
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}) {
  if (!open) return null;
  const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative bg-white rounded-2xl shadow-pop border border-ink-200 w-full max-h-[90vh] flex flex-col',
          sizeMap[size]
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h3 className="font-display font-700 text-ink-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 transition rounded-md p-1 hover:bg-ink-100"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin px-5 py-4 flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-ink-100 flex items-center justify-end gap-2 bg-ink-50/50 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white shadow-pop border-l border-ink-200 h-full ml-auto flex flex-col animate-slide-in"
        style={{ width }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
            <h3 className="font-display font-700 text-ink-900">{title}</h3>
            <button
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 transition rounded-md p-1 hover:bg-ink-100"
              aria-label="Cerrar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="overflow-y-auto scrollbar-thin flex-1">{children}</div>
      </div>
    </div>
  );
}

export function Toast({
  message,
  tone = 'success',
  onClose,
}: {
  message: string;
  tone?: 'success' | 'error' | 'info';
  onClose: () => void;
}) {
  const toneMap = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-brand-600',
  };
  return (
    <div className="fixed bottom-6 right-6 z-[60] animate-fade-in">
      <div className={cn('text-white px-4 py-3 rounded-xl shadow-pop flex items-center gap-3', toneMap[tone])}>
        <span className="text-sm font-500">{message}</span>
        <button onClick={onClose} className="opacity-80 hover:opacity-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
