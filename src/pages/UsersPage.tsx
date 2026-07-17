import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Plus, Search, RefreshCw, Edit2, Lock,
  UserCheck, UserX, ChevronLeft, ChevronRight,
  ShieldCheck, Building2, AlertTriangle, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Branch, ProfileWithRole, RoleName } from '../types/database';
import { ROLE_LABELS, ALL_ROLES } from '../types/roles';
import { UserFormDrawer, type UserFormData } from './users/UserFormDrawer';
import { ChangePasswordModal } from './users/ChangePasswordModal';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const PAGE_SIZE = 10;

// ── Role badge ────────────────────────────────────────────────────────────────
const ROLE_BADGE: Record<RoleName, string> = {
  ADMINISTRADOR: 'bg-blue-100 text-blue-700 border-blue-200',
  CARGADOR:      'bg-amber-100 text-amber-700 border-amber-200',
  PROCESADOR:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  CONSULTOR:     'bg-slate-100 text-slate-600 border-slate-200',
};

function RoleBadge({ role }: { role: RoleName }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE[role]}`}>
      <ShieldCheck className="w-3 h-3" />
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-rose-400'}`} />
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading,
}: {
  open: boolean; title: string; message: string; confirmLabel: string;
  confirmClass: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${confirmClass}`}>
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── API helper ────────────────────────────────────────────────────────────────
async function callManageUsers(
  action: string,
  payload: Record<string, unknown>,
  token: string,
): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return { error: data.error ?? 'Error desconocido.' };
    return { error: null };
  } catch {
    return { error: 'Error de red. Intenta nuevamente.' };
  }
}

// ── Main page ────────────────────────────────────────────────────────────────
export function UsersPage() {
  const { session, profile: currentProfile } = useAuth();

  // Data
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleName | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Pagination
  const [page, setPage] = useState(1);

  // Drawer / modals
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser] = useState<ProfileWithRole | null>(null);
  const [pwUser, setPwUser] = useState<ProfileWithRole | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ProfileWithRole | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    const [usersRes, branchesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*, role:roles(*), branch:branches(*)')
        .order('full_name', { ascending: true }),
      supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]);
    if (usersRes.error) { setDataError(usersRes.error.message); }
    else { setUsers((usersRes.data ?? []) as ProfileWithRole[]); }
    if (!branchesRes.error) setBranches(branchesRes.data ?? []);
    setLoadingData(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filtered + paginated ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (q && !u.full_name.toLowerCase().includes(q) && !u.username.toLowerCase().includes(q)) return false;
      if (roleFilter && u.role?.name !== roleFilter) return false;
      if (branchFilter && u.branch_id !== branchFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      return true;
    });
  }, [users, search, roleFilter, branchFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, roleFilter, branchFilter, statusFilter]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
  }), [users]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const getToken = () => session?.access_token ?? '';

  const handleCreate = async (data: UserFormData): Promise<{ error: string | null }> => {
    const result = await callManageUsers('create', {
      full_name: data.full_name,
      username: data.username,
      password: data.password,
      role_name: data.role_name,
      branch_id: data.branch_id || null,
      is_active: data.is_active,
    }, getToken());
    if (!result.error) { showToast('Usuario creado exitosamente.'); await fetchData(); }
    return result;
  };

  const handleUpdate = async (data: UserFormData): Promise<{ error: string | null }> => {
    if (!editUser) return { error: null };
    const result = await callManageUsers('update', {
      user_id: editUser.id,
      full_name: data.full_name,
      role_name: data.role_name,
      branch_id: data.branch_id || null,
      is_active: data.is_active,
    }, getToken());
    if (!result.error) { showToast('Usuario actualizado.'); await fetchData(); }
    return result;
  };

  const handleChangePassword = async (userId: string, newPassword: string): Promise<{ error: string | null }> => {
    const result = await callManageUsers('change-password', { user_id: userId, new_password: newPassword }, getToken());
    if (!result.error) showToast('Contraseña cambiada exitosamente.');
    return result;
  };

  const handleToggleStatus = async () => {
    if (!toggleTarget) return;
    setToggleLoading(true);
    const result = await callManageUsers('toggle-status', {
      user_id: toggleTarget.id,
      is_active: !toggleTarget.is_active,
    }, getToken());
    setToggleLoading(false);
    setToggleTarget(null);
    if (result.error) { showToast(result.error, 'error'); }
    else { showToast(`Usuario ${toggleTarget.is_active ? 'inactivado' : 'activado'}.`); await fetchData(); }
  };

  const clearFilters = () => { setSearch(''); setRoleFilter(''); setBranchFilter(''); setStatusFilter('all'); };
  const hasActiveFilters = search || roleFilter || branchFilter || statusFilter !== 'all';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Administración de usuarios del sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loadingData}
            className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditUser(null); setDrawerOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Activos', value: stats.active, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Inactivos', value: stats.inactive, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 px-4 py-3`}>
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre o usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Role */}
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleName | '')}
            className="py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Todos los roles</option>
            {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>

          {/* Branch */}
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            className="py-2 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">Todas las sucursales</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {/* Status */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
                  statusFilter === s ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
            </p>
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {dataError && (
          <div className="p-4 bg-rose-50 text-rose-700 text-sm border-b border-rose-200">{dataError}</div>
        )}

        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
              <Users className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm">
              {hasActiveFilters ? 'No se encontraron usuarios con los filtros aplicados.' : 'No hay usuarios registrados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Usuario</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Sucursal</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((user, idx) => {
                  const isCurrentUser = user.id === currentProfile?.id;
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  return (
                    <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${!user.is_active ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3.5 text-slate-400 text-xs">{rowNum}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            user.is_active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {user.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 leading-tight">
                              {user.full_name}
                              {isCurrentUser && (
                                <span className="ml-1.5 text-xs font-normal text-blue-600">(yo)</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400">@{user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {user.role?.name && <RoleBadge role={user.role.name} />}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        {user.branch ? (
                          <span className="flex items-center gap-1 text-slate-600 text-xs">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {user.branch.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge active={user.is_active} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit */}
                          <button
                            onClick={() => { setEditUser(user); setDrawerOpen(true); }}
                            title="Editar usuario"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {/* Change password */}
                          <button
                            onClick={() => setPwUser(user)}
                            title="Cambiar contraseña"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                          {/* Toggle status */}
                          <button
                            onClick={() => setToggleTarget(user)}
                            disabled={isCurrentUser}
                            title={user.is_active ? 'Inactivar usuario' : 'Activar usuario'}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${
                              user.is_active
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loadingData && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-1 text-slate-400 text-sm">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                        currentPage === p ? 'bg-blue-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}>
                      {p}
                    </button>
                  ),
                )}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawers & Modals */}
      <UserFormDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditUser(null); }}
        onSubmit={editUser ? handleUpdate : handleCreate}
        editUser={editUser}
        branches={branches}
      />

      <ChangePasswordModal
        open={!!pwUser}
        user={pwUser}
        onClose={() => setPwUser(null)}
        onSubmit={handleChangePassword}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'Inactivar Usuario' : 'Activar Usuario'}
        message={
          toggleTarget?.is_active
            ? `¿Inactivar a "${toggleTarget?.full_name}"? No podrá iniciar sesión hasta que sea reactivado.`
            : `¿Activar a "${toggleTarget?.full_name}"? Podrá iniciar sesión nuevamente.`
        }
        confirmLabel={toggleTarget?.is_active ? 'Inactivar' : 'Activar'}
        confirmClass={toggleTarget?.is_active ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}
        onConfirm={handleToggleStatus}
        onCancel={() => setToggleTarget(null)}
        loading={toggleLoading}
      />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
