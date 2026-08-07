import path from 'path';
import { prisma } from '../../config/prisma';

/** Minúsculas, sin acentos, guiones/guiones bajos tratados como espacio, espacios de más
 * colapsados — para que "Hamburguesa_Clasica.jpg" empareje con el producto "Hamburguesa Clásica". */
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface BulkPhotoMatch {
  fileName: string;
  productId: string;
  productName: string;
  photoUrl: string;
}

export interface BulkPhotoResult {
  matched: BulkPhotoMatch[];
  unmatched: string[];
}

/**
 * Carga masiva de fotos de producto: cada archivo se empareja con un producto por su NOMBRE
 * (sin extensión, ignorando mayúsculas/acentos/guiones), no por posición ni orden de subida.
 * Un archivo que no matchea ningún producto del restaurante se guarda en disco (ya lo dejó ahí
 * multer) pero no se vincula ni se reporta como error — solo aparece en `unmatched` para que el
 * usuario lo suba manualmente o corrija el nombre.
 */
export const productPhotoBulkService = {
  async matchAndAssign(restaurantId: string, files: Express.Multer.File[]): Promise<BulkPhotoResult> {
    const products = await prisma.product.findMany({
      where: { restaurantId },
      select: { id: true, name: true },
    });
    const byNormalizedName = new Map<string, { id: string; name: string }>();
    for (const p of products) {
      byNormalizedName.set(normalizeName(p.name), p);
    }

    const matched: BulkPhotoMatch[] = [];
    const unmatched: string[] = [];

    for (const file of files) {
      const baseName = path.basename(file.originalname, path.extname(file.originalname));
      const product = byNormalizedName.get(normalizeName(baseName));
      if (!product) {
        unmatched.push(file.originalname);
        continue;
      }
      const photoUrl = `/uploads/products/${file.filename}`;
      await prisma.product.update({ where: { id: product.id }, data: { photoUrl } });
      matched.push({ fileName: file.originalname, productId: product.id, productName: product.name, photoUrl });
    }

    return { matched, unmatched };
  },
};
