import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({ log: [] });

async function main() {
  const r = await prisma.restaurant.findFirst({ select: { id: true } });
  if (!r) throw new Error('no hay restaurante de prueba');

  const court = await prisma.clubCourt.create({
    data: { restaurantId: r.id, name: 'ZZTEST Cancha Overlap', sport: 'PADEL' },
  });

  const base = new Date('2030-01-01T18:00:00.000Z');
  const h = (n: number) => new Date(base.getTime() + n * 3600_000);

  const mk = (from: number, to: number, kind: any = 'BOOKING') =>
    prisma.clubCourtBlock.create({
      data: { restaurantId: r.id, courtId: court.id, kind, startsAt: h(from), endsAt: h(to) },
    });

  const results: string[] = [];
  const check = async (label: string, fn: () => Promise<any>, shouldFail: boolean) => {
    try {
      await fn();
      results.push(`${shouldFail ? '❌ FALLA' : '✅ OK'}  ${label} → insertó`);
    } catch (e: any) {
      const isExcl = String(e.message).includes('club_court_blocks_no_overlap');
      results.push(`${shouldFail && isExcl ? '✅ OK' : '❌ FALLA'}  ${label} → rechazado${isExcl ? ' por la restricción' : ': ' + e.message.slice(0, 80)}`);
    }
  };

  await check('18-19h base', () => mk(0, 1), false);
  await check('18-19h EXACTA duplicada', () => mk(0, 1), true);
  await check('18:30-19:30h solapa parcial', () => prisma.clubCourtBlock.create({
    data: { restaurantId: r.id, courtId: court.id, kind: 'BOOKING', startsAt: new Date(base.getTime() + 1800_000), endsAt: new Date(base.getTime() + 5400_000) },
  }), true);
  await check('17-20h envuelve a la existente', () => mk(-1, 2), true);
  await check('19-20h contigua (semiabierto)', () => mk(1, 2), false);
  await check('MANTENIMIENTO 18-19h sobre reserva', () => mk(0, 1, 'MAINTENANCE'), true);

  // Cancelar libera el hueco
  await prisma.clubCourtBlock.updateMany({
    where: { courtId: court.id, startsAt: h(0) }, data: { status: 'CANCELLED' },
  });
  await check('18-19h tras CANCELAR la anterior', () => mk(0, 1), false);

  // Otra cancha, misma hora: debe permitirse
  const court2 = await prisma.clubCourt.create({
    data: { restaurantId: r.id, name: 'ZZTEST Cancha 2', sport: 'PADEL' },
  });
  await check('otra cancha, misma hora', () => prisma.clubCourtBlock.create({
    data: { restaurantId: r.id, courtId: court2.id, kind: 'BOOKING', startsAt: h(0), endsAt: h(1) },
  }), false);

  console.log('\n' + results.join('\n'));

  // Carrera real: 8 inserciones simultáneas del MISMO horario
  const court3 = await prisma.clubCourt.create({
    data: { restaurantId: r.id, name: 'ZZTEST Cancha Carrera', sport: 'PADEL' },
  });
  const race = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      prisma.clubCourtBlock.create({
        data: { restaurantId: r.id, courtId: court3.id, kind: 'BOOKING', startsAt: h(5), endsAt: h(6) },
      })
    )
  );
  const ok = race.filter((x) => x.status === 'fulfilled').length;
  console.log(`\n🏁 Carrera de 8 reservas simultáneas al mismo horario → ${ok} insertada(s), ${8 - ok} rechazada(s)`);
  console.log(ok === 1 ? '✅ Exactamente una ganó, como debe ser.' : '❌ FALLA: se coló más de una.');

  await prisma.clubCourt.deleteMany({ where: { name: { startsWith: 'ZZTEST' } } });
  const left = await prisma.clubCourt.count({ where: { name: { startsWith: 'ZZTEST' } } });
  console.log(`\n🧹 Limpieza: quedan ${left} canchas de prueba`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
