import { z } from 'zod';

/** Nivel de pádel: 1.0 a 6.0 en pasos de 0.5. Se guarda como Decimal(2,1) y no
 * como enum porque la consulta que importa es de rango ("qué grupos admiten a un
 * 3.5"), y con un enum haría falta un mapa de orden paralelo. */
const level = z
  .number()
  .min(1)
  .max(6)
  .refine((n) => Number.isInteger(n * 2), 'El nivel va de 1.0 a 6.0 en pasos de 0.5');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Hora inválida (HH:mm)');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const weekday = z.number().int().min(0).max(6);
const money = z.number().nonnegative().max(1_000_000);

export const coachPayTypeSchema = z.enum([
  'FIXED_PER_SESSION',
  'HOURLY',
  'COMMISSION_ON_CONSUMED',
  'COMMISSION_ON_ENROLLMENT',
  'MIXED',
]);

/**
 * Qué campos de honorario son obligatorios depende del modo que eligió el
 * administrador. Se valida acá y no en el servicio para que el error salga con
 * el nombre del campo, no como un 500 al calcular la liquidación.
 */
const coachPayFields = {
  payType: coachPayTypeSchema.default('FIXED_PER_SESSION'),
  payAmountBase: money.nullish(),
  commissionPercent: z.number().min(0).max(100).nullish(),
};

function checkPay(v: { payType: string; payAmountBase?: number | null; commissionPercent?: number | null }, ctx: z.RefinementCtx) {
  const needsAmount = v.payType === 'FIXED_PER_SESSION' || v.payType === 'HOURLY' || v.payType === 'MIXED';
  const needsPercent =
    v.payType === 'COMMISSION_ON_CONSUMED' || v.payType === 'COMMISSION_ON_ENROLLMENT' || v.payType === 'MIXED';
  if (needsAmount && (v.payAmountBase === null || v.payAmountBase === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['payAmountBase'], message: 'Este modo de pago necesita un monto.' });
  }
  if (needsPercent && (v.commissionPercent === null || v.commissionPercent === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['commissionPercent'], message: 'Este modo de pago necesita un porcentaje.' });
  }
}

// ------------------------------------------------------------------ Ajustes
export const academySettingsSchema = z.object({
  defaultReleaseHoursBefore: z.number().int().min(0).max(168).optional(),
  cancelDeadlineHours: z.number().int().min(0).max(168).optional(),
  maxMakeupPerMonth: z.number().int().min(0).max(31).optional(),
  creditExpiryDays: z.number().int().min(1).max(3650).nullish(),
  enrollmentOpensDaysBefore: z.number().int().min(0).max(365).optional(),
  privateHoldMinutes: z.number().int().min(5).max(1440).optional(),
  enforceLevelOnEnroll: z.boolean().optional(),
  notifyCoachOnEnroll: z.boolean().optional(),
});
export type AcademySettingsInput = z.infer<typeof academySettingsSchema>;

// ------------------------------------------------------------- Entrenadores
export const createCoachSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    // Obligatorio: es el canal del aviso por WhatsApp, que es un requisito del
    // módulo, no un extra.
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().email().max(120).nullish(),
    userId: z.string().cuid().nullish(),
    employeeId: z.string().cuid().nullish(),
    levelMin: level.nullish(),
    levelMax: level.nullish(),
    bio: z.string().trim().max(500).nullish(),
    ...coachPayFields,
  })
  .superRefine((v, ctx) => {
    checkPay(v, ctx);
    if (v.levelMin != null && v.levelMax != null && v.levelMin > v.levelMax) {
      ctx.addIssue({ code: 'custom', path: ['levelMax'], message: 'El nivel máximo no puede ser menor que el mínimo.' });
    }
  });
export type CreateCoachInput = z.infer<typeof createCoachSchema>;

export const updateCoachSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    email: z.string().trim().email().max(120).nullish(),
    userId: z.string().cuid().nullish(),
    employeeId: z.string().cuid().nullish(),
    levelMin: level.nullish(),
    levelMax: level.nullish(),
    bio: z.string().trim().max(500).nullish(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    payType: coachPayTypeSchema.optional(),
    payAmountBase: money.nullish(),
    commissionPercent: z.number().min(0).max(100).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.payType) checkPay({ ...v, payType: v.payType }, ctx);
  });
export type UpdateCoachInput = z.infer<typeof updateCoachSchema>;

export const coachAvailabilitySchema = z.object({
  slots: z
    .array(z.object({ weekday, startTime: hhmm, endTime: hhmm }))
    .max(60)
    .refine((arr) => arr.every((s) => s.endTime > s.startTime), 'La hora de fin debe ser posterior a la de inicio.'),
});
export type CoachAvailabilityInput = z.infer<typeof coachAvailabilitySchema>;

export const coachTimeOffSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().max(160).nullish(),
  })
  .refine((v) => v.endsAt > v.startsAt, { path: ['endsAt'], message: 'La fecha de fin debe ser posterior.' });
export type CoachTimeOffInput = z.infer<typeof coachTimeOffSchema>;

// ------------------------------------------------------------------- Grupos
export const classSlotSchema = z.object({
  weekday,
  startTime: hhmm,
  durationMinutes: z.number().int().min(30).max(240),
  courtId: z.string().cuid().nullish(),
});

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    coachId: z.string().cuid(),
    levelMin: level,
    levelMax: level,
    classType: z.enum(['GROUP', 'PRIVATE', 'CLINIC']).default('GROUP'),
    capacityMin: z.number().int().min(1).max(20).default(2),
    capacityMax: z.number().int().min(1).max(20).default(4),
    seasonStart: dateStr,
    seasonEnd: dateStr.nullish(),
    priceMonthlyBase: money.nullish(),
    pricePerClassBase: money.nullish(),
    packagePriceBase: money.nullish(),
    packageClasses: z.number().int().min(1).max(200).nullish(),
    releaseHoursBefore: z.number().int().min(0).max(168).nullish(),
    slots: z.array(classSlotSchema).min(1).max(7),
  })
  .superRefine((v, ctx) => {
    if (v.levelMin > v.levelMax) {
      ctx.addIssue({ code: 'custom', path: ['levelMax'], message: 'El nivel máximo no puede ser menor que el mínimo.' });
    }
    if (v.capacityMin > v.capacityMax) {
      ctx.addIssue({ code: 'custom', path: ['capacityMax'], message: 'El cupo máximo no puede ser menor que el mínimo.' });
    }
    if (v.seasonEnd && v.seasonEnd < v.seasonStart) {
      ctx.addIssue({ code: 'custom', path: ['seasonEnd'], message: 'La temporada no puede terminar antes de empezar.' });
    }
    // Un lote sin número de clases no se puede vender: no habría cuántas fichas dar.
    if (v.packagePriceBase != null && !v.packageClasses) {
      ctx.addIssue({ code: 'custom', path: ['packageClasses'], message: 'Indica cuántas clases trae el lote.' });
    }
  });
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  coachId: z.string().cuid().optional(),
  levelMin: level.optional(),
  levelMax: level.optional(),
  capacityMin: z.number().int().min(1).max(20).optional(),
  capacityMax: z.number().int().min(1).max(20).optional(),
  seasonEnd: dateStr.nullish(),
  priceMonthlyBase: money.nullish(),
  pricePerClassBase: money.nullish(),
  packagePriceBase: money.nullish(),
  packageClasses: z.number().int().min(1).max(200).nullish(),
  releaseHoursBefore: z.number().int().min(0).max(168).nullish(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED']).optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const generateSessionsSchema = z.object({
  weeks: z.number().int().min(1).max(26).optional(),
});

/** Reubicar una sesión que quedó NEEDS_COURT, o mover una ya agendada. */
export const reassignSessionSchema = z.object({
  courtId: z.string().cuid().nullish(),
  date: dateStr.optional(),
  startTime: hhmm.optional(),
});
export type ReassignSessionInput = z.infer<typeof reassignSessionSchema>;

// ------------------------------------------------------------------ Sesiones
export const createSessionSchema = z.object({
  coachId: z.string().cuid(),
  courtId: z.string().cuid(),
  date: dateStr,
  startTime: hhmm,
  durationMinutes: z.number().int().min(30).max(240),
  classType: z.enum(['PRIVATE', 'CLINIC', 'GROUP']).default('PRIVATE'),
  capacityMin: z.number().int().min(1).max(20).default(1),
  capacityMax: z.number().int().min(1).max(20).default(2),
  studentIds: z.array(z.string().cuid()).max(20).optional(),
  note: z.string().trim().max(200).nullish(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const listSessionsQuerySchema = z.object({
  date: dateStr.optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  coachId: z.string().cuid().optional(),
  groupId: z.string().cuid().optional(),
  status: z
    .enum(['SCHEDULED', 'NEEDS_COURT', 'PENDING_PAYMENT', 'CONFIRMED', 'DONE', 'CANCELLED', 'RELEASED'])
    .optional(),
});
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

export const cancelSessionSchema = z.object({
  reason: z.string().trim().max(200).nullish(),
  /** Devolver ficha a los inscritos. Por defecto sí: la cancela el club, no ellos. */
  refundCredits: z.boolean().default(true),
});
export type CancelSessionInput = z.infer<typeof cancelSessionSchema>;

/**
 * Asistencia EN LOTE, nunca una llamada por alumno: en una cancha con mala señal,
 * ocho peticiones sueltas dejan la lista a medias y el profesor no sabe cuáles
 * pasaron.
 */
export const attendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.string().cuid(),
        status: z.enum(['PRESENT', 'ABSENT', 'JUSTIFIED', 'MAKEUP']),
      }),
    )
    .min(1)
    .max(40),
});
export type AttendanceInput = z.infer<typeof attendanceSchema>;

// ------------------------------------------------------------------ Alumnos
export const createStudentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(20),
  idNumber: z.string().trim().max(20).nullish(),
  level: level.nullish(),
  birthDate: dateStr.nullish(),
  guardianName: z.string().trim().max(80).nullish(),
  guardianPhone: z.string().trim().max(20).nullish(),
  medicalNotes: z.string().trim().max(500).nullish(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  level: level.nullish(),
  birthDate: dateStr.nullish(),
  guardianName: z.string().trim().max(80).nullish(),
  guardianPhone: z.string().trim().max(20).nullish(),
  medicalNotes: z.string().trim().max(500).nullish(),
  active: z.boolean().optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  groupId: z.string().cuid().optional(),
  level: level.optional(),
  active: z.enum(['true', 'false']).optional(),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

/** Ajuste manual de fichas. El motivo es obligatorio: sin él, el libro mayor
 * deja de ser auditable, que es la única razón de que exista. */
export const adjustCreditsSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'El ajuste no puede ser 0.'),
  note: z.string().trim().min(3).max(200),
});
export type AdjustCreditsInput = z.infer<typeof adjustCreditsSchema>;

// ------------------------------------------------------------ Inscripciones
export const createEnrollmentSchema = z.object({
  studentId: z.string().cuid(),
  groupId: z.string().cuid(),
  billingMode: z.enum(['MONTHLY', 'PACKAGE', 'PER_CLASS']).default('MONTHLY'),
  priceBase: money.optional(),
  billingDay: z.number().int().min(1).max(28).nullish(),
  startsAt: dateStr.optional(),
  /** Motivo por el que se salta la regla de nivel. Queda como rastro. */
  levelOverrideReason: z.string().trim().max(200).nullish(),
});
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

export const updateEnrollmentSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'FINISHED']).optional(),
  billingDay: z.number().int().min(1).max(28).nullish(),
  endsAt: dateStr.nullish(),
});
export type UpdateEnrollmentInput = z.infer<typeof updateEnrollmentSchema>;

// ------------------------------------------------------ Lotes, cobros, pagos
// Espejo exacto del enum PaymentMethod del esquema. No inventar valores acá: uno
// de más ("OTHER") compila en el DTO y revienta al escribir en la base.
const paymentMethod = z.enum(['CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'TRANSFER', 'CARD', 'ZELLE', 'BINANCE', 'PAYPAL']);

/**
 * Venta de un lote. El alumno escoge un horario fijo (`slotId`) y esa silla queda
 * reservada durante meses — por eso el cupo se cuenta hacia adelante y no solo
 * por asistencias pasadas.
 */
export const sellPackageSchema = z.object({
  studentId: z.string().cuid(),
  groupId: z.string().cuid().nullish(),
  slotId: z.string().cuid().nullish(),
  name: z.string().trim().min(2).max(80).optional(),
  totalClasses: z.number().int().min(1).max(200),
  priceBase: money,
  holdsSeat: z.boolean().default(true),
  /** Vencimiento explícito; si no viene sale de creditExpiryDays de los ajustes. */
  expiresAt: dateStr.nullish(),
  method: paymentMethod,
  referenceNumber: z.string().trim().max(60).nullish(),
  proofImageUrl: z.string().trim().max(300).nullish(),
});
export type SellPackageInput = z.infer<typeof sellPackageSchema>;

/** El vencimiento se puede mover después: un alumno lesionado dos meses no debe
 * perder lo que pagó porque el plazo por defecto no lo contemplaba. */
export const updatePackageSchema = z.object({
  expiresAt: dateStr.nullish(),
  holdsSeat: z.boolean().optional(),
  slotId: z.string().cuid().nullish(),
});
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

export const recordPaymentSchema = z.object({
  studentId: z.string().cuid(),
  kind: z.enum(['PACKAGE', 'MONTHLY', 'SINGLE_CLASS', 'ENROLLMENT_FEE']),
  chargeId: z.string().cuid().nullish(),
  sessionId: z.string().cuid().nullish(),
  amountBase: money.refine((n) => n > 0, 'El monto debe ser mayor a 0.'),
  method: paymentMethod,
  referenceNumber: z.string().trim().max(60).nullish(),
  proofImageUrl: z.string().trim().max(300).nullish(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const generateChargesSchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
});
export type GenerateChargesInput = z.infer<typeof generateChargesSchema>;

export const listChargesQuerySchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'WAIVED', 'OVERDUE']).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
export type ListChargesQuery = z.infer<typeof listChargesQuerySchema>;

// ------------------------------------------------------------- Liquidaciones
export const payoutSchema = z.object({
  from: dateStr,
  to: dateStr,
  /** Registrarlo como gasto de nómina. Por defecto sí: si no, el honorario del
   * profesor queda fuera del balance y del arqueo. */
  registerExpense: z.boolean().default(true),
  paymentMethod: paymentMethod.default('CASH'),
});
export type PayoutInput = z.infer<typeof payoutSchema>;

export const rangeQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
});
export type RangeQuery = z.infer<typeof rangeQuerySchema>;

// ------------------------------------------------------------------ Público
export const publicCancelSchema = z.object({ sessionId: z.string().cuid() });

/** Solicitud de particular hecha por el alumno. Bloquea cancha con un hold que
 * vence si no se verifica el pago. */
export const publicPrivateRequestSchema = z.object({
  coachId: z.string().cuid(),
  courtId: z.string().cuid(),
  date: dateStr,
  startTime: hhmm,
  durationMinutes: z.number().int().min(30).max(240).default(60),
  method: paymentMethod,
  referenceNumber: z.string().trim().max(60).nullish(),
});
export type PublicPrivateRequestInput = z.infer<typeof publicPrivateRequestSchema>;
