import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, UserPlus, UsersRound } from 'lucide-react';
import { api } from '@/api/client';

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

const roleLabel = (role: string) => role === 'ADMIN' ? 'Administrador' : 'Recepción';

export default function AppointmentTeam() {
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'CASHIER'>('CASHIER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState<{ name: string; value: string } | null>(null);

  async function load() {
    try {
      const response = await api.get('/team');
      setMembers(response.data.data.filter((member: Member) => ['ADMIN', 'CASHIER'].includes(member.role)));
      setError('');
    } catch {
      setError('No se pudo cargar el equipo. Intenta de nuevo.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post('/team', { name: name.trim(), email: email.trim(), password, role });
      setName(''); setEmail(''); setPassword('');
      setNotice('Usuario agregado. Ya puede entrar con su correo y contraseña.');
      await load();
    } catch (cause: unknown) {
      const response = cause as { response?: { data?: { error?: string; message?: string } } };
      setError(response.response?.data?.message || response.response?.data?.error || 'No se pudo agregar este usuario.');
    } finally { setBusy(false); }
  }

  async function changeStatus(member: Member) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.patch(`/team/${member.id}`, { isActive: !member.isActive });
      setNotice(member.isActive ? 'Acceso desactivado.' : 'Acceso activado.');
      await load();
    } catch { setError('No se pudo cambiar el acceso de este usuario.'); }
    finally { setBusy(false); }
  }

  async function resetPassword(member: Member) {
    if (!window.confirm(`¿Generar una contraseña temporal para ${member.name}? La actual dejará de funcionar.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.post(`/team/${member.id}/reset-password`, {});
      setTemporaryPassword({ name: member.name, value: response.data.data.temporaryPassword });
    } catch { setError('No se pudo generar la contraseña temporal.'); }
    finally { setBusy(false); }
  }

  return <section className="apt-card apt-team">
    <div className="apt-team-heading"><div className="apt-team-icon"><UsersRound size={22}/></div><div><h2>Equipo de trabajo</h2><p className="apt-muted text-base">Crea accesos personales al panel de Citas. Los perfiles que ven los clientes se editan en Profesionales.</p></div></div>
    <div className="apt-team-content">
      <form className="apt-team-form" onSubmit={create}>
        <h3><UserPlus size={18}/> Agregar usuario</h3>
        <div className="apt-form-grid">
          <label className="apt-field text-sm font-medium">Nombre<input value={name} onChange={event=>setName(event.target.value)} required minLength={2} maxLength={120} autoComplete="name"/></label>
          <label className="apt-field text-sm font-medium">Correo<input type="email" value={email} onChange={event=>setEmail(event.target.value)} required autoComplete="email"/></label>
          <label className="apt-field text-sm font-medium">Contraseña<input type="password" value={password} onChange={event=>setPassword(event.target.value)} required minLength={8} maxLength={100} autoComplete="new-password"/></label>
          <label className="apt-field text-sm font-medium">Acceso<select value={role} onChange={event=>setRole(event.target.value as 'ADMIN'|'CASHIER')}><option value="CASHIER">Recepción · citas y pagos</option><option value="ADMIN">Administrador · acceso completo</option></select></label>
        </div>
        <button className="apt-button" disabled={busy}><UserPlus size={17}/>{busy ? 'Guardando…' : 'Agregar al equipo'}</button>
      </form>
      <div className="apt-team-list"><h3>Usuarios con acceso <span>{members.length}</span></h3>
        {members.length ? members.map(member=><div className="apt-team-member" key={member.id}><div className="apt-team-avatar">{member.name.trim().slice(0,2).toUpperCase()}</div><div className="apt-team-member-details"><strong>{member.name}</strong><small>{member.email}</small><span>{roleLabel(member.role)} · {member.isActive?'Activo':'Sin acceso'}</span></div><div className="apt-team-member-actions"><button type="button" onClick={()=>void resetPassword(member)} disabled={busy}>Restablecer clave</button><button type="button" onClick={()=>void changeStatus(member)} disabled={busy}>{member.isActive?'Desactivar':'Activar'}</button></div></div>) : <p className="apt-muted text-base">Aún no has agregado usuarios al equipo.</p>}
      </div>
    </div>
    {temporaryPassword&&<div className="apt-team-temporary" role="status"><CheckCircle2 size={18}/><div><strong>Contraseña temporal de {temporaryPassword.name}</strong><p>Compártela de forma privada. Solo se muestra ahora.</p><code>{temporaryPassword.value}</code></div><button type="button" onClick={()=>setTemporaryPassword(null)}>Cerrar</button></div>}
    {error&&<p className="apt-error text-xs" role="alert">{error}</p>}
    {notice&&<p className="apt-notice text-base" role="status">{notice}</p>}
  </section>;
}
