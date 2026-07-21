import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';

interface PlatformAdminRow {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER';
  createdAt: string;
}

const ROLE_LABEL: Record<PlatformAdminRow['role'], string> = { ADMIN: 'Administrador', MANAGER: 'Gestor' };

export default function MasterAdminsPage() {
  const [admins, setAdmins] = useState<PlatformAdminRow[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PlatformAdminRow['role']>('MANAGER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformAdminRow | null>(null);

  function load() {
    masterApi.get('/master/admins').then((res) => setAdmins(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await masterApi.post('/master/admins', { name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('MANAGER');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la cuenta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Usuarios del Dashboard</h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Crea cuentas de Gestor para tu equipo: ven exactamente lo mismo que el Administrador.
        </p>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-brand-950/70">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Contraseña</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PlatformAdminRow['role'])}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            >
              <option value="MANAGER">Gestor</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear cuenta'}
        </TextureButton>
      </form>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {admins?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin cuentas todavía.</p>}
        {admins?.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-brand-950">{a.name}</p>
              <p className="text-xs text-brand-950/40 font-light">{a.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  a.role === 'ADMIN' ? 'bg-brand-950/[0.08] text-brand-950/70' : 'bg-brand-500/10 text-brand-500'
                }`}
              >
                {ROLE_LABEL[a.role]}
              </span>
              <button
                onClick={() => setEditing(a)}
                aria-label={`Editar ${a.name}`}
                className="text-brand-950/40 hover:text-brand-500 transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <EditAdminDialog admin={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

function EditAdminDialog({
  admin,
  onClose,
  onSaved,
}: {
  admin: PlatformAdminRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PlatformAdminRow['role']>('MANAGER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (admin) {
      setName(admin.name);
      setEmail(admin.email);
      setPassword('');
      setRole(admin.role);
      setError(null);
    }
  }, [admin]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!admin) return;
    setSaving(true);
    setError(null);
    try {
      await masterApi.patch(`/master/admins/${admin.id}`, { name, email, password, role });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!admin} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-brand-950/70">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Nueva contraseña</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Déjalo en blanco para no cambiarla"
              minLength={8}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-950/70">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PlatformAdminRow['role'])}
              className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2"
            >
              <option value="MANAGER">Gestor</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
