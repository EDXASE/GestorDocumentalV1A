import { lazy, Suspense, useMemo } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from './Router';
import { ROUTES } from './routes';
import { useAuth } from '../context/AuthContext';
import { RequireRole } from './RouteProtection';
import { LoadingScreen } from '../components/LoadingScreen';
import type { RoleName } from '../types/database';

const pageCache: Record<string, ComponentType> = {};

function loadPage(
  loader: () => Promise<{ [key: string]: ComponentType }>,
  path: string,
): ComponentType {
  if (!pageCache[path]) {
    const LazyComp = lazy(async () => {
      const mod = await loader();
      const Comp = mod.default ?? Object.values(mod)[0];
      return { default: Comp };
    });
    pageCache[path] = LazyComp;
  }
  return pageCache[path];
}

function matchRoute(
  path: string,
  routes: typeof ROUTES,
): { route: (typeof ROUTES)[number]; params: Record<string, string> } | null {
  for (const route of routes) {
    const pattern = route.path.replace(/:(\w+)/g, '(?<$1>[^/]+)');
    const regex = new RegExp(`^${pattern}$`);
    const match = path.match(regex);
    if (match) {
      return { route, params: match.groups ?? {} };
    }
  }
  return null;
}

export function AppRoutes() {
  const { path } = useRouter();
  const { profile } = useAuth();

  const match = useMemo(() => matchRoute(path, ROUTES), [path]);

  if (!match) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-2xl font-bold text-slate-700">Pagina no encontrada</h2>
        <p className="text-slate-500">La ruta solicitada no existe.</p>
        <a
          href="#/dashboard"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Ir al panel principal
        </a>
      </div>
    );
  }

  const { route } = match;

  if (route.allowedRoles && profile) {
    const role = profile.role?.name as RoleName;
    if (!route.allowedRoles.includes(role)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <h2 className="text-2xl font-bold text-slate-700">
            Acceso denegado
          </h2>
          <p className="text-slate-500">
            No tienes permisos para acceder a esta pagina.
          </p>
        </div>
      );
    }
  }

  const LazyComponent = loadPage(route.component, route.path);

  const wrapped = route.allowedRoles ? (
    <RequireRole allowed={route.allowedRoles}>
      <Suspense fallback={<LoadingScreen />}>
        <LazyComponent />
      </Suspense>
    </RequireRole>
  ) : (
    <Suspense fallback={<LoadingScreen />}>
      <LazyComponent />
    </Suspense>
  );

  return wrapped;
}
