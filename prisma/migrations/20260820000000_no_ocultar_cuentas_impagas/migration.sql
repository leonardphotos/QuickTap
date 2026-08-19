-- Una cuenta con saldo pendiente no puede salir de la pantalla de Pedidos.
--
-- El cierre de caja ya respeta esto (solo sella `clearedAt` en las saldadas), pero el 14/08/2026
-- un UPDATE masivo por SQL directo selló 142 pedidos de golpe sin mirar el saldo, y dejó plata
-- sin cobrar invisible para varios locales. Un guardia en el código de la app no habría servido:
-- ese UPDATE nunca pasó por la app.
--
-- Por eso vive acá abajo, en la base: cubre a la aplicación, a un script suelto y a alguien
-- escribiendo SQL a mano por igual.
--
-- No lanza error a propósito: anula el intento y deja la cuenta visible. Un error abortaría el
-- cierre de caja entero por un pedido, y el objetivo es no perder de vista la deuda, no bloquear
-- la operación del local.
CREATE OR REPLACE FUNCTION no_ocultar_cuentas_impagas() RETURNS trigger AS $$
DECLARE
  pagado numeric;
BEGIN
  -- Solo interesa el momento en que se pasa a "oculta".
  IF NEW."clearedAt" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mismo criterio de saldo que la app (ver addPayment y clearSettledOrders): un descuento o un
  -- ajuste de servicio perdonan parte de la deuda y por eso cuentan como pagado.
  SELECT COALESCE(SUM(
           p."amountBase"
           + COALESCE(p."discountBase", 0)
           + COALESCE(p."serviceChargeDiscountBase", 0)
         ), 0)
    INTO pagado
    FROM order_payments p
   WHERE p."orderId" = NEW.id;

  -- Tolerancia de un centavo, igual que la app, para no pelear con el redondeo.
  IF ROUND(NEW."totalBase" - pagado, 2) > 0.01 THEN
    NEW."clearedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_ocultar_cuentas_impagas ON orders;
CREATE TRIGGER trg_no_ocultar_cuentas_impagas
  BEFORE INSERT OR UPDATE OF "clearedAt" ON orders
  FOR EACH ROW
  EXECUTE FUNCTION no_ocultar_cuentas_impagas();
