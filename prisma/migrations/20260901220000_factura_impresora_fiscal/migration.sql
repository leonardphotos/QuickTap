-- Comprobante de la factura emitida por la impresora fiscal FÍSICA del local.
-- Distinto de la tabla fiscal_invoices, que es la facturación DIGITAL vía Unidigital:
-- son dos vías alternativas y un restaurante usa una u otra, no las dos.
ALTER TABLE "orders" ADD COLUMN "fiscalPrinterInvoice" TEXT;
ALTER TABLE "orders" ADD COLUMN "fiscalPrinterSerial" TEXT;
ALTER TABLE "orders" ADD COLUMN "fiscalPrintedAt" TIMESTAMP(3);
