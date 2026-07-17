import { AuthProvider, useAuth } from './context/AuthContext';
import { RouterProvider, useRouter } from './router/Router';
import { RequireAuth, PublicOnly } from './router/RouteProtection';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { LoadingScreen } from './components/LoadingScreen';
import { useEffect } from 'react';

function AppContent() {
  const { path, navigate } = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (path === '/' || path === '') {
      navigate(session ? '/dashboard' : '/login');
    }
  }, [path, session, navigate]);

  if (loading) return <LoadingScreen />;

  if (path === '/login' || path === '/login/') {
    return (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    );
  }

  return (
    <RequireAuth>
      <MainLayout />
    </RequireAuth>
  );
}

function App() {
  return (
    <AuthProvider>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </AuthProvider>
  );
}

export default App;
