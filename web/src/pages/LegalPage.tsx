import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TextureButton } from '@/components/ui/texture-button';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

const LAST_UPDATED = '4 de agosto de 2026';

const SECTIONS = [
  { id: 'terminos', label: 'Términos y Condiciones' },
  { id: 'privacidad', label: 'Aviso Legal y Privacidad' },
];

export default function LegalPage() {
  useDocumentMeta('Términos y privacidad — QuickTap', 'Términos de servicio y política de privacidad de QuickTap.');
  return (
    <div className="min-h-screen bg-white text-brand-950">
      {/* Nav flotante, mismo estilo que las demás páginas públicas (ver PlansPage.tsx) */}
      <header className="fixed top-4 inset-x-0 z-30 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 rounded-full bg-brand-950/80 backdrop-blur-md border border-white/10 shadow-lg shadow-brand-950/30 px-4 py-2">
          <Link to="/">
            <img src="/logo/icono-blanco.png" alt="QuickTap" className="h-7 w-7" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/" className="hidden sm:inline text-sm text-white/70 hover:text-white px-2 py-1.5">
              Inicio
            </Link>
            <Link to="/admin/login" className="text-sm text-white/70 hover:text-white px-2 py-1.5">
              Iniciar sesión
            </Link>
            <Link
              to="/empezar"
              className="text-sm font-medium bg-white text-brand-950 rounded-full px-3 py-1.5 hover:bg-white/90"
            >
              Regístrate
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-28 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-950">Legal</h1>
          <p className="mt-2 text-sm text-brand-950/50 font-light">Última actualización: {LAST_UPDATED}</p>

          {/* Sub-nav entre las dos secciones */}
          <div className="mt-6 sticky top-20 z-20 -mx-4 px-4 py-2 bg-white/90 backdrop-blur-sm border-y border-brand-950/10 flex gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-sm font-medium text-brand-950/70 hover:text-brand-500 rounded-full px-3 py-1.5 hover:bg-brand-400/10 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* TÉRMINOS Y CONDICIONES                                             */}
          {/* ------------------------------------------------------------------ */}
          <section id="terminos" className="scroll-mt-32 mt-10">
            <h2 className="text-2xl font-bold text-brand-950">Términos y Condiciones de Uso</h2>
            <p className="mt-3 text-brand-950/70 font-light leading-relaxed">
              Estos Términos y Condiciones ("Términos") regulan el acceso y uso de QuickTap.club ("QuickTap", "la
              Plataforma", "nosotros"), un software como servicio (SaaS) que permite a restaurantes, tiendas,
              barberías y demás negocios comerciales ("el Negocio", "tú", "el Cliente") gestionar su menú digital,
              pedidos en tiempo real, punto de venta, inventario y checkout de delivery/pickup. Al crear una cuenta o
              usar la Plataforma aceptas estos Términos en su totalidad. Si no estás de acuerdo, no debes usar
              QuickTap.
            </p>

            <Article title="1. Quiénes pueden usar QuickTap">
              <p>
                QuickTap está dirigido a personas naturales o jurídicas que operen un negocio legalmente constituido
                o en proceso de constitución. Al registrarte declaras que tienes capacidad legal para contratar y que
                la información que proporcionas (nombre del negocio, teléfono, correo, RIF si aplica) es veraz y
                actualizada.
              </p>
            </Article>

            <Article title="2. La cuenta y tu responsabilidad">
              <ul>
                <li>Eres responsable de mantener la confidencialidad de tu contraseña y de toda la actividad que ocurra bajo tu cuenta y las de tu equipo (meseros, cocina, cajeros, administradores).</li>
                <li>Eres el único responsable del contenido que cargues: nombres y precios de productos, fotos, descripciones, datos de tus clientes y cualquier otra información introducida en el panel.</li>
                <li>Debes notificarnos de inmediato ante cualquier uso no autorizado de tu cuenta.</li>
              </ul>
            </Article>

            <Article title="3. Planes, prueba gratuita y facturación">
              <ul>
                <li>Toda cuenta nueva inicia con un período de prueba gratuita de 15 días con acceso completo.</li>
                <li>
                  Al finalizar la prueba, debes activar un plan de pago para seguir usando el panel administrativo.
                  El menú público de tu negocio y el inicio de sesión siguen disponibles incluso si tu cuenta queda
                  bloqueada por falta de pago — el bloqueo afecta únicamente las funciones del panel.
                </li>
                <li>
                  QuickTap no procesa pagos automáticamente: reportas el pago de tu plan (Pago Móvil, transferencia u
                  otro medio habilitado) junto con el número de referencia, y nuestro equipo lo confirma
                  manualmente. La activación puede tardar mientras se verifica el pago.
                </li>
                <li>
                  Si tu suscripción vence, cuentas con un período de gracia de 12 horas antes de que se bloqueen las
                  funciones del panel. Los precios de cada plan y sus beneficios están publicados en{' '}
                  <Link to="/planes" className="text-brand-500 hover:underline">
                    quicktap.club/planes
                  </Link>
                  y pueden cambiar con aviso previo razonable para renovaciones futuras.
                </li>
                <li>Los pagos realizados no son reembolsables salvo que la ley aplicable indique lo contrario.</li>
              </ul>
            </Article>

            <Article title="4. Uso aceptable">
              <p>Al usar QuickTap te comprometes a no:</p>
              <ul>
                <li>Usar la Plataforma para actividades ilegales, fraudulentas o que infrinjan derechos de terceros.</li>
                <li>Publicar contenido engañoso, difamatorio, discriminatorio o que viole derechos de propiedad intelectual de terceros.</li>
                <li>Intentar vulnerar la seguridad de la Plataforma, acceder a datos de otros negocios/tenants, o interferir con su funcionamiento normal.</li>
                <li>Revender, sublicenciar o explotar comercialmente el software de QuickTap fuera del uso previsto para tu propio negocio.</li>
              </ul>
            </Article>

            <Article title="5. Pedidos, WhatsApp y comunicación con tus clientes">
              <p>
                QuickTap facilita el envío de pedidos de delivery/pickup mediante un enlace prearmado hacia el
                WhatsApp del Negocio, y la confirmación de pedidos en mesa por código QR. La relación comercial
                (precio, calidad, tiempos de entrega, cumplimiento fiscal, atención al cliente) es exclusivamente
                entre el Negocio y su comensal — QuickTap es un proveedor de tecnología y no interviene en esas
                transacciones ni es parte de ellas.
              </p>
            </Article>

            <Article title="6. Propiedad intelectual">
              <p>
                El software, diseño, marca y logotipo de QuickTap son propiedad de QuickTap y están protegidos por
                las leyes de propiedad intelectual aplicables. No se te otorga ningún derecho sobre ellos más allá
                de la licencia de uso necesaria para operar tu cuenta. El contenido que tú cargues (fotos de
                productos, textos, logo de tu negocio) sigue siendo de tu propiedad; nos concedes una licencia
                limitada para almacenarlo y mostrarlo como parte del servicio (por ejemplo, en tu menú público).
              </p>
            </Article>

            <Article title="7. Disponibilidad del servicio">
              <p>
                Hacemos esfuerzos razonables para mantener la Plataforma disponible, pero no garantizamos un servicio
                ininterrumpido o libre de errores. Podemos realizar mantenimientos, actualizaciones o correcciones
                que impliquen interrupciones temporales, procurando avisar con antelación cuando sea posible.
              </p>
            </Article>

            <Article title="8. Limitación de responsabilidad">
              <p>
                En la máxima medida permitida por la ley, QuickTap no será responsable por pérdidas de ingresos,
                datos, oportunidades de negocio o daños indirectos derivados del uso o la imposibilidad de uso de la
                Plataforma, incluyendo fallas de terceros (proveedores de internet, WhatsApp, pasarelas de pago,
                fuentes de tasa de cambio). Tampoco somos responsables por decisiones fiscales, de precios o de
                inventario que tomes usando la información generada por la Plataforma.
              </p>
            </Article>

            <Article title="9. Suspensión y terminación">
              <p>
                Podemos suspender o cancelar tu cuenta si incumples estos Términos, por falta de pago prolongada, o
                por uso indebido de la Plataforma. Puedes dejar de usar QuickTap y solicitar la eliminación de tu
                cuenta en cualquier momento escribiéndonos a{' '}
                <a href="mailto:soporte@quicktap.club" className="text-brand-500 hover:underline">
                  soporte@quicktap.club
                </a>
                .
              </p>
            </Article>

            <Article title="10. Cambios a estos Términos">
              <p>
                Podemos actualizar estos Términos ocasionalmente. Los cambios entran en vigor al publicarse en esta
                página con su fecha de actualización. El uso continuado de QuickTap después de un cambio implica su
                aceptación.
              </p>
            </Article>

            <Article title="11. Ley aplicable">
              <p>
                Estos Términos se rigen por las leyes de la República Bolivariana de Venezuela. Cualquier
                controversia se someterá a los tribunales competentes, sin perjuicio de otros mecanismos de
                resolución que las partes acuerden.
              </p>
            </Article>
          </section>

          {/* ------------------------------------------------------------------ */}
          {/* AVISO LEGAL Y PRIVACIDAD                                           */}
          {/* ------------------------------------------------------------------ */}
          <section id="privacidad" className="scroll-mt-32 mt-16 pt-10 border-t border-brand-950/10">
            <h2 className="text-2xl font-bold text-brand-950">Aviso Legal y Política de Privacidad</h2>
            <p className="mt-3 text-brand-950/70 font-light leading-relaxed">
              Esta sección explica qué datos recopila QuickTap, con qué fin, y cómo puedes ejercer tus derechos
              sobre ellos. Aplica tanto a los dueños/equipo de un Negocio que usa el panel administrativo como a los
              comensales/clientes finales que hacen un pedido desde un menú público.
            </p>

            <Article title="1. Identificación del prestador del servicio">
              <p>
                QuickTap.club es operado como un servicio de software para la gestión de negocios de alimentos y
                comercio, con actividad en la República Bolivariana de Venezuela. Para consultas legales o de
                privacidad puedes escribir a{' '}
                <a href="mailto:legal@quicktap.club" className="text-brand-500 hover:underline">
                  legal@quicktap.club
                </a>
                .
              </p>
            </Article>

            <Article title="2. Qué datos recopilamos">
              <ul>
                <li><strong>Del dueño/equipo del Negocio:</strong> nombre, correo, teléfono, contraseña (almacenada cifrada), RIF si lo cargas, y la actividad dentro del panel (productos, pedidos, ventas, reportes).</li>
                <li><strong>Del comensal/cliente final:</strong> nombre, teléfono y, si lo autorizas al usar delivery, tu dirección o ubicación GPS aproximada — se usan únicamente para procesar tu pedido con el Negocio correspondiente.</li>
                <li><strong>Datos técnicos:</strong> información básica de la sesión (token de acceso guardado en tu navegador) necesaria para mantenerte conectado al panel o al menú.</li>
                <li><strong>Comprobantes de pago:</strong> si reportas un pago de suscripción o de un pedido, la imagen del comprobante y el número de referencia que adjuntes.</li>
              </ul>
            </Article>

            <Article title="3. Para qué usamos tus datos">
              <ul>
                <li>Operar la Plataforma: crear tu cuenta, procesar pedidos, generar reportes, calcular precios y tasas de cambio.</li>
                <li>Verificar pagos de suscripción y de pedidos.</li>
                <li>Comunicarnos contigo sobre tu cuenta (avisos de vencimiento, cambios importantes, soporte).</li>
                <li>Mejorar la Plataforma y prevenir fraude o uso indebido.</li>
              </ul>
            </Article>

            <Article title="4. Con quién compartimos tus datos">
              <p>
                No vendemos tus datos. Los compartimos únicamente cuando es necesario para operar el servicio, por
                ejemplo:
              </p>
              <ul>
                <li>Con el Negocio correspondiente, cuando eres un comensal haciendo un pedido (nombre, teléfono, dirección).</li>
                <li>Con proveedores de infraestructura (hosting, almacenamiento de imágenes) que procesan datos en nuestro nombre bajo confidencialidad.</li>
                <li>Cuando la ley lo exija, ante una autoridad competente.</li>
              </ul>
            </Article>

            <Article title="5. Aislamiento entre negocios">
              <p>
                QuickTap es una plataforma multi-negocio: los datos de cada Negocio (productos, pedidos, clientes,
                equipo) están aislados y no son accesibles por otros negocios que usan la Plataforma. El acceso del
                equipo de QuickTap a esos datos se limita a lo necesario para brindar soporte técnico o dar
                cumplimiento a estos Términos.
              </p>
            </Article>

            <Article title="6. Cuánto tiempo conservamos tus datos">
              <p>
                Conservamos tus datos mientras tu cuenta esté activa y por el tiempo adicional necesario para cumplir
                obligaciones legales, contables o de resolución de disputas. Si solicitas la eliminación de tu
                cuenta, eliminamos o anonimizamos los datos personales asociados salvo que debamos conservar algún
                registro por obligación legal.
              </p>
            </Article>

            <Article title="7. Tus derechos">
              <p>
                Puedes solicitar acceso, corrección o eliminación de tus datos personales, así como oponerte a un
                uso específico, escribiendo a{' '}
                <a href="mailto:soporte@quicktap.club" className="text-brand-500 hover:underline">
                  soporte@quicktap.club
                </a>
                . Responderemos en un plazo razonable, pudiendo pedir información adicional para verificar tu
                identidad.
              </p>
            </Article>

            <Article title="8. Seguridad">
              <p>
                Aplicamos medidas técnicas razonables para proteger tus datos (contraseñas cifradas, control de
                acceso por rol, aislamiento por negocio). Ningún sistema es 100% infalible; si detectamos un
                incidente de seguridad que afecte tus datos, te lo notificaremos conforme a lo exigido por la ley
                aplicable.
              </p>
            </Article>

            <Article title="9. Menores de edad">
              <p>
                QuickTap no está dirigido a menores de edad para la creación de cuentas de Negocio. Si eres menor de
                edad, solo debes usar la Plataforma como comensal bajo supervisión de un adulto responsable.
              </p>
            </Article>

            <Article title="10. Cambios a este aviso">
              <p>
                Podemos actualizar este Aviso Legal y Política de Privacidad para reflejar cambios en la Plataforma
                o en la normativa aplicable. La fecha de "Última actualización" al inicio de esta página indica la
                versión vigente.
              </p>
            </Article>
          </section>

          <p className="mt-16 text-sm text-brand-950/50 font-light">
            ¿Tienes dudas sobre estos Términos o sobre cómo manejamos tus datos? Escríbenos a{' '}
            <a href="mailto:soporte@quicktap.club" className="text-brand-500 hover:underline">
              soporte@quicktap.club
            </a>
            .
          </p>
        </div>
      </main>

      {/* Footer, mismo estilo que las demás páginas públicas */}
      <footer className="border-t border-brand-950/10 bg-brand-950/[0.03]">
        <div className="max-w-5xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo/icono.png" alt="" className="h-7 w-7" />
            <p className="text-sm text-brand-950/60 font-light">
              © {new Date().getFullYear()} QuickTap.club — todo a un toque.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-brand-950/70 hover:text-brand-950">
              Inicio
            </Link>
            <Link to="/admin/login" className="text-sm text-brand-950/70 hover:text-brand-950">
              Iniciar sesión
            </Link>
            <Link to="/empezar">
              <TextureButton variant="primary" size="sm" className="!w-auto">
                Regístrate y comienza gratis hoy
              </TextureButton>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Bloque "N. Título" + contenido, mismo patrón repetido para cada artículo de ambas secciones. */
function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold text-brand-950">{title}</h3>
      <div className="mt-1.5 text-sm text-brand-950/70 font-light leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:pl-1">
        {children}
      </div>
    </div>
  );
}
