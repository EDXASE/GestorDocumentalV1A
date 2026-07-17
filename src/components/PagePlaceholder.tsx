import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';

interface PagePlaceholderProps {
  title: string;
  description: string;
  icon?: ReactNode;
  allowedRoles?: string[];
}

export function PagePlaceholder({
  title,
  description,
  icon,
  allowedRoles,
}: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12">
        <div className="flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
            {icon ?? <Construction className="w-8 h-8" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-700">
              Modulo en preparacion
            </h2>
            <p className="mt-1 text-sm text-slate-500 max-w-md">
              La arquitectura base esta lista. Los formularios operativos de
              este modulo se desarrollaran en la siguiente etapa.
            </p>
          </div>
          {allowedRoles && allowedRoles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 justify-center">
              {allowedRoles.map((role) => (
                <span
                  key={role}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
                >
                  {role}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
