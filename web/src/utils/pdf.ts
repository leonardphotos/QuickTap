import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Captura un elemento del DOM (una plantilla de recibo/comanda oculta fuera
 * de pantalla) y lo descarga como PDF de una sola página, ajustado al ancho.
 */
export async function downloadElementAsPdf(element: HTMLElement, filename: string) {
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');

  const pxToMm = 0.264583;
  const widthMm = canvas.width * pxToMm * 0.5; // scale:2 compensado
  const heightMm = canvas.height * pxToMm * 0.5;

  const pdf = new jsPDF({
    orientation: heightMm > widthMm ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [widthMm, heightMm],
  });
  pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm);
  pdf.save(filename);
}
