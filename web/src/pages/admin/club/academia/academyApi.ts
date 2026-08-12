import { api } from '@/api/client';

const BASE = '/club/academy';

export interface Coach {
  id: string;
  displayName: string;
  phone: string;
  email: string | null;
  levelMin: string | null;
  levelMax: string | null;
  active: boolean;
  payType: 'FIXED_PER_SESSION' | 'HOURLY' | 'COMMISSION_ON_CONSUMED' | 'COMMISSION_ON_ENROLLMENT' | 'MIXED';
  payAmountBase: string | null;
  commissionPercent: string | null;
  availability: { id: string; weekday: number; startTime: string; endTime: string }[];
}

export interface ClassSlot {
  id: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  courtId: string | null;
  court?: { id: string; name: string } | null;
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  active: boolean;
  _count: { groups: number };
}

export interface WaitlistEntry {
  id: string;
  status: 'WAITING' | 'OFFERED' | 'ENROLLED' | 'CANCELLED';
  position: number;
  createdAt: string;
  note: string | null;
  group: { id: string; name: string; capacityMax: number };
  student: { id: string; customer: { name: string; phone: string } };
}

export interface ClassGroup {
  id: string;
  name: string;
  program: { id: string; name: string; color: string | null } | null;
  levelMin: string;
  levelMax: string;
  capacityMin: number;
  capacityMax: number;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  priceMonthlyBase: string | null;
  pricePerClassBase: string | null;
  packagePriceBase: string | null;
  packageClasses: number | null;
  coach: { id: string; displayName: string };
  slots: ClassSlot[];
  _count: { enrollments: number; sessions: number; waitlist: number };
}

export interface ClassSession {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'NEEDS_COURT' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'RELEASED';
  capacityMin: number;
  capacityMax: number;
  occupiedSeats: number;
  coachFeeBase: string | null;
  group: { id: string; name: string } | null;
  coach: { id: string; displayName: string };
  court: { id: string; name: string } | null;
  attendances: { id: string; studentId: string; status: string }[];
}

export interface Student {
  id: string;
  level: string | null;
  active: boolean;
  accessToken: string;
  creditBalance: number;
  customer: { name: string; phone: string; idNumber?: string | null };
  enrollments: { id: string; groupId: string; billingMode: string; group: { id: string; name: string } }[];
}

export interface AcademyDashboard {
  todaySessions: (ClassSession & { _count: { attendances: number } })[];
  needsCourt: number;
  activeStudents: number;
  activeGroups: number;
  pendingCharges: { count: number; amountBase: string };
}

export const academyApi = {
  dashboard: () => api.get<{ data: AcademyDashboard }>(`${BASE}/dashboard`).then((r) => r.data.data),

  listCoaches: () => api.get<{ data: Coach[] }>(`${BASE}/coaches`).then((r) => r.data.data),
  createCoach: (body: unknown) => api.post(`${BASE}/coaches`, body).then((r) => r.data.data),
  updateCoach: (id: string, body: unknown) => api.patch(`${BASE}/coaches/${id}`, body).then((r) => r.data.data),
  deleteCoach: (id: string) => api.delete(`${BASE}/coaches/${id}`).then((r) => r.data.data),
  setAvailability: (id: string, slots: unknown[]) =>
    api.put(`${BASE}/coaches/${id}/availability`, { slots }).then((r) => r.data.data),
  coachEarnings: (id: string, from?: string, to?: string) =>
    api.get(`${BASE}/coaches/${id}/earnings`, { params: { from, to } }).then((r) => r.data.data),
  payCoach: (id: string, body: unknown) => api.post(`${BASE}/coaches/${id}/payouts`, body).then((r) => r.data.data),

  listPrograms: () => api.get<{ data: Program[] }>(`${BASE}/programs`).then((r) => r.data.data),
  createProgram: (body: unknown) => api.post(`${BASE}/programs`, body).then((r) => r.data.data),
  updateProgram: (id: string, body: unknown) => api.patch(`${BASE}/programs/${id}`, body).then((r) => r.data.data),
  deleteProgram: (id: string) => api.delete(`${BASE}/programs/${id}`).then((r) => r.data.data),

  listWaitlist: (groupId?: string) =>
    api.get<{ data: WaitlistEntry[] }>(`${BASE}/waitlist`, { params: { groupId } }).then((r) => r.data.data),
  joinWaitlist: (body: unknown) => api.post(`${BASE}/waitlist`, body).then((r) => r.data.data),
  leaveWaitlist: (id: string) => api.delete(`${BASE}/waitlist/${id}`).then((r) => r.data.data),

  scheduleMakeup: (sessionId: string, body: unknown) =>
    api.post(`${BASE}/sessions/${sessionId}/makeup`, body).then((r) => r.data.data),

  retention: (months = 6) => api.get(`${BASE}/reports/retention`, { params: { months } }).then((r) => r.data.data),
  revenueByCoach: (from?: string, to?: string) =>
    api.get(`${BASE}/reports/by-coach`, { params: { from, to } }).then((r) => r.data.data),

  listGroups: () => api.get<{ data: ClassGroup[] }>(`${BASE}/groups`).then((r) => r.data.data),
  createGroup: (body: unknown) => api.post(`${BASE}/groups`, body).then((r) => r.data.data),
  updateGroup: (id: string, body: unknown) => api.patch(`${BASE}/groups/${id}`, body).then((r) => r.data.data),
  generate: (id: string, weeks?: number) => api.post(`${BASE}/groups/${id}/generate`, { weeks }).then((r) => r.data.data),
  conflicts: () => api.get(`${BASE}/conflicts`).then((r) => r.data.data),

  listSessions: (params: Record<string, string | undefined>) =>
    api.get<{ data: ClassSession[] }>(`${BASE}/sessions`, { params }).then((r) => r.data.data),
  createSession: (body: unknown) => api.post(`${BASE}/sessions`, body).then((r) => r.data.data),
  reassign: (id: string, body: unknown) => api.post(`${BASE}/sessions/${id}/reassign`, body).then((r) => r.data.data),
  cancelSession: (id: string, body: unknown) => api.post(`${BASE}/sessions/${id}/cancel`, body).then((r) => r.data.data),
  roster: (id: string) => api.get(`${BASE}/sessions/${id}/attendance`).then((r) => r.data.data),
  markAttendance: (id: string, entries: unknown[]) =>
    api.post(`${BASE}/sessions/${id}/attendance`, { entries }).then((r) => r.data.data),

  listStudents: (params: Record<string, string | undefined>) =>
    api.get<{ data: Student[] }>(`${BASE}/students`, { params }).then((r) => r.data.data),
  createStudent: (body: unknown) => api.post(`${BASE}/students`, body).then((r) => r.data.data),
  getStudent: (id: string) => api.get(`${BASE}/students/${id}`).then((r) => r.data.data),
  credits: (id: string) => api.get(`${BASE}/students/${id}/credits`).then((r) => r.data.data),
  adjustCredits: (id: string, body: unknown) => api.post(`${BASE}/students/${id}/credits`, body).then((r) => r.data.data),

  enroll: (body: unknown) => api.post(`${BASE}/enrollments`, body).then((r) => r.data.data),
  sellPackage: (body: unknown) => api.post(`${BASE}/packages`, body).then((r) => r.data.data),

  listCharges: (params: Record<string, string | undefined>) =>
    api.get(`${BASE}/charges`, { params }).then((r) => r.data.data),
  generateCharges: () => api.post(`${BASE}/charges/generate`, {}).then((r) => r.data.data),
  notifyCharges: () => api.post(`${BASE}/charges/notify`, {}).then((r) => r.data.data),
  recordPayment: (body: unknown) => api.post(`${BASE}/payments`, body).then((r) => r.data.data),

  getSettings: () => api.get(`${BASE}/settings`).then((r) => r.data.data),
  updateSettings: (body: unknown) => api.put(`${BASE}/settings`, body).then((r) => r.data.data),

  revenue: (from?: string, to?: string) =>
    api.get(`${BASE}/reports/revenue`, { params: { from, to } }).then((r) => r.data.data),
};

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const PAY_TYPE_LABELS: Record<Coach['payType'], string> = {
  FIXED_PER_SESSION: 'Fijo por clase',
  HOURLY: 'Por hora',
  COMMISSION_ON_CONSUMED: '% de lo consumido en clase',
  COMMISSION_ON_ENROLLMENT: '% de la mensualidad',
  MIXED: 'Fijo + comisión',
};

export const SESSION_STATUS_LABELS: Record<ClassSession['status'], string> = {
  SCHEDULED: 'Agendada',
  NEEDS_COURT: 'Sin cancha',
  PENDING_PAYMENT: 'Esperando pago',
  CONFIRMED: 'Confirmada',
  DONE: 'Dada',
  CANCELLED: 'Cancelada',
  RELEASED: 'Liberada',
};

/** Niveles 1.0 a 6.0 en pasos de 0.5, como los usa el pádel. */
export const LEVELS = Array.from({ length: 11 }, (_, i) => 1 + i * 0.5);
