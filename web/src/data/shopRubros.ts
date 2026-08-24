/**
 * Catálogo de ejemplo por rubro de retail (QuickTap Shop). Portado 1:1 desde el prototipo
 * funcional (quicktap-shop-prototipo.html) para que el registro "Locales Comerciales" y el
 * dashboard de Shop (ver web/src/pages/admin/shop/) muestren datos de ejemplo coherentes con
 * el rubro elegido al registrarse. Esto es solo semilla en memoria — no viene de la base de
 * datos; ShopLayout la usa para poblar el estado inicial de productos/categorías/variantes.
 */

export interface ShopVariant {
  v1: string;
  v2: string;
  stock: number;
  /** Se vende por peso (Kg): en el carrito la cantidad se ingresa en Kg (decimal), no en
   * unidades enteras — pensado para verduras/frutas/carnes y otros productos a granel. */
  soldByWeight?: boolean;
  /** Descripción propia de la variante. Vacío = se usa la del producto. */
  description?: string;
  /** Precio de venta propio. Ausente = usa el del producto. Lo usan los catálogos donde la
   *  variante cambia el precio y no solo el nombre (ej. presión de una manguera). */
  price?: number;
  /** Costo propio, promedio de SUS lotes. Ausente = usa el del producto. */
  cost?: number;
}

export interface ShopProductSeed {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  /** Marca del producto (ej. "Coca-Cola") — opcional porque las plantillas de ejemplo por rubro
   * no la traen cargada; en un producto real siempre viene como string ('' si no se cargó). */
  brand?: string;
  sku: string;
  location: string;
  price: number;
  cost: number;
  minStock: number;
  variants: ShopVariant[];
  /** Precio mayorista: se aplica automáticamente en Venta cuando la cantidad del carrito llega
   * a wholesaleMinQty. Ninguno de los dos si el negocio no maneja precio por cantidad. */
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  /** Precio promocional: si está seteado, se aplica siempre en vez de `price` (gana sobre el
   * mayorista) — para ofertas puntuales sin tener que editar el precio de lista. */
  promoPrice?: number;
  /** Fecha de vencimiento (ISO yyyy-mm-dd), opcional — para alertar productos por vencer. */
  expiryDate?: string;
  /** Foto del producto — obligatoria al crear uno nuevo desde Inventario. */
  photoUrl?: string;
  /** Aparece en el catálogo público de la tienda virtual (/tienda/:slug). Apagado por defecto:
   * el inventario también guarda insumos internos que no se le venden a nadie por internet. */
  isPublished?: boolean;
  /** 'AREA_ROLL' = impresión de gran formato: se cobra por m² saliendo de un rollo de ancho
   * fijo, y price/cost pasan a ser por m² (ver shop/printPricing.ts). 'SERVICE' = rubro de
   * servicios (estética/barbería): no lleva stock, nunca aparece "Agotado". Ausente o 'UNIT' =
   * venta por unidad de siempre. */
  pricingMode?: 'UNIT' | 'AREA_ROLL' | 'SERVICE';
  /** Unidad de venta: por unidad, kilo o metro. Ausente = 'UND' (ver ShopProduct.saleUnit). */
  saleUnit?: 'UND' | 'KG' | 'MT';
  /** Anchos de rollo disponibles en metros, ej. [1.06, 1.37, 1.6, 1.84]. Solo con AREA_ROLL. */
  rollWidths?: number[];
  /** Largo del rollo en metros (típicamente 50) — base para derivar el costo por m². */
  rollLengthM?: number;
  // --- Plan de consumo: metros comprados por adelantado a tarifa rebajada ---
  /** Sin declarar en las plantillas de ejemplo por rubro, igual que isEvent/saleUnit — solo se
   * usa en productos reales (ver ShopProduct.consumptionPlanEnabled). */
  consumptionPlanEnabled?: boolean;
  consumptionPlanRate?: number;
  consumptionPlanSizes?: number[];
  isEvent?: boolean;
  eventDate?: string;
  eventTime?: string;
  eventSeats?: number;
}

export interface ShopRubro {
  id: string;
  label: string;
  emoji: string;
  storeName: string;
  /** Nombre de la primera dimensión de variante (ej: "Talla", "Presentación"). */
  dim1: string;
  dim1Example: string;
  /** Segunda dimensión de variante, o null si el rubro no la necesita (ej: panaderías). */
  dim2: string | null;
  dim2Example?: string;
  suppliers: string[];
  categories: string[];
  products: ShopProductSeed[];
}

type VariantRow = [v1: string, v2: string, stock: number, soldByWeight?: boolean];
type ProductRow = [
  name: string,
  category: string,
  subcategory: string,
  sku: string,
  location: string,
  price: number,
  cost: number,
  minStock: number,
  variantRows: VariantRow[],
];

interface ShopRubroDef {
  id: string;
  label: string;
  emoji: string;
  storeName: string;
  dim1: string;
  dim1Example: string;
  dim2: string | null;
  dim2Example?: string;
  suppliers: string[];
  categories: string[];
  products: ProductRow[];
}

function buildProducts(rubroId: string, rows: ProductRow[]): ShopProductSeed[] {
  return rows.map((row, i) => {
    const [name, category, subcategory, sku, location, price, cost, minStock, variantRows] = row;
    return {
      id: `${rubroId}-p${i}`,
      name,
      category,
      subcategory,
      sku,
      location,
      price,
      cost,
      minStock,
      variants: variantRows.map(([v1, v2, stock, soldByWeight]) => ({ v1, v2: v2 || '', stock, soldByWeight: soldByWeight ?? false })),
    };
  });
}

const RUBRO_DEFS: ShopRubroDef[] = [
  {
    id: 'agencia_publicidad', label: 'Agencias de Publicidad', emoji: '📢',
    storeName: 'Agencia Creativa Impacto · Oficina Central',
    // Los "productos" de este rubro son servicios, no mercancía física: dim1 indica la
    // modalidad de contratación en vez de talla/color, y no hay dim2 (los servicios no
    // tienen una segunda variante como color). El "stock" alto es intencional — un
    // servicio no se agota, así que se evita que dispare alertas de stock bajo/agotado.
    dim1: 'Modalidad', dim1Example: 'Por proyecto', dim2: null,
    suppliers: ['Freelancers de Diseño', 'Estudio de Fotografía y Video Externo'],
    categories: ['Diseño Gráfico', 'Redes Sociales', 'Pauta Digital (Ads)', 'Producción de Video y Foto', 'Branding'],
    products: [
      ['Diseño de Logo', 'Diseño Gráfico', 'Identidad Visual', 'DIS-LOG', 'Equipo Creativo', 150.00, 40.00, 999, [['Por proyecto', '', 999]]],
      ['Manual de Marca', 'Branding', 'Identidad Visual', 'MAN-MAR', 'Equipo Creativo', 280.00, 90.00, 999, [['Por proyecto', '', 999]]],
      ['Gestión de RRSS (mensual)', 'Redes Sociales', 'Community Management', 'GES-RRS', 'Equipo Creativo', 300.00, 80.00, 999, [['Mensual', '', 999]]],
      ['Diseño de Post para RRSS', 'Redes Sociales', 'Contenido', 'DIS-POS', 'Equipo Creativo', 25.00, 8.00, 999, [['Por pieza', '', 999]]],
      ['Pauta en Meta Ads (gestión)', 'Pauta Digital (Ads)', 'Meta Ads', 'PAU-MET', 'Equipo Digital', 200.00, 50.00, 999, [['Mensual', '', 999]]],
      ['Pauta en Google Ads (gestión)', 'Pauta Digital (Ads)', 'Google Ads', 'PAU-GOO', 'Equipo Digital', 220.00, 55.00, 999, [['Mensual', '', 999]]],
      ['Video Promocional 30s', 'Producción de Video y Foto', 'Video', 'VID-30S', 'Estudio Externo', 250.00, 90.00, 999, [['Por proyecto', '', 999]]],
      ['Sesión de Fotografía de Producto', 'Producción de Video y Foto', 'Fotografía', 'FOT-PRO', 'Estudio Externo', 120.00, 45.00, 999, [['Por sesión', '', 999]]],
    ],
  },
  {
    id: 'cafeteria', label: 'Cafeterías y Heladerías', emoji: '☕',
    storeName: 'Café Aroma · Local Centro',
    dim1: 'Tamaño', dim1Example: 'Grande', dim2: 'Sabor', dim2Example: 'Chocolate',
    suppliers: ['Torrefactora Andina', 'Helados La Fresa'],
    categories: ['Café', 'Helados', 'Repostería', 'Bebidas Frías'],
    products: [
      ['Café Espresso', 'Café', 'Espresso', 'CAF-ESP', 'Barra', 1.50, 0.50, 5, [['Chico', '', 30], ['Grande', '', 20]]],
      ['Cappuccino', 'Café', 'Bebidas de Café', 'CAP-CLA', 'Barra', 2.20, 0.80, 5, [['Chico', '', 25], ['Grande', '', 18]]],
      ['Helado en Copa', 'Helados', 'Copas', 'HEL-COP', 'Vitrina Fría', 3.50, 1.50, 5, [['1 bola', 'Chocolate', 20], ['2 bolas', 'Vainilla', 15], ['1 bola', 'Fresa', 10]]],
      ['Malteada', 'Helados', 'Batidos', 'MAL-CLA', 'Barra', 3.80, 1.60, 5, [['Chico', 'Chocolate', 20], ['Grande', 'Fresa', 12]]],
      ['Waffle con Helado', 'Repostería', 'Waffles', 'WAF-HEL', 'Barra', 4.50, 2.00, 3, [['Clásico', 'Chocolate', 10]]],
      ['Jugo Natural', 'Bebidas Frías', 'Jugos', 'JUG-NAT', 'Barra', 2.00, 0.80, 4, [['Chico', 'Naranja', 15], ['Grande', 'Parchita', 10]]],
    ],
  },
  {
    id: 'carniceria', label: 'Carnicerías y Pescaderías', emoji: '🥩',
    storeName: 'Carnicería El Buen Corte · Local Centro',
    dim1: 'Corte', dim1Example: 'Molida', dim2: 'Presentación', dim2Example: '1kg',
    suppliers: ['Frigorífico Los Llanos', 'Pescadería del Puerto'],
    categories: ['Res', 'Cerdo', 'Pollo', 'Pescados y Mariscos'],
    products: [
      ['Carne Molida', 'Res', 'Molidas', 'CAR-MOL', 'Nevera 1', 5.50, 3.80, 8, [['Molida especial', '1kg', 15, true], ['Molida especial', '500g', 10, true]]],
      ['Lomito', 'Res', 'Cortes Finos', 'LOM-RES', 'Nevera 1', 9.80, 7.00, 4, [['Entero', '1kg', 5, true], ['Medallones', '500g', 6, true]]],
      ['Chuleta de Cerdo', 'Cerdo', 'Chuletas', 'CHU-CER', 'Nevera 2', 4.20, 2.60, 6, [['Chuleta', '1kg', 10, true], ['Chuleta', '500g', 8, true]]],
      ['Pollo Entero', 'Pollo', 'Enteros', 'POL-ENT', 'Nevera 3', 3.50, 2.20, 10, [['Entero', '1.8kg aprox', 12], ['Entero', '2.5kg aprox', 6]]],
      ['Filete de Pescado', 'Pescados y Mariscos', 'Filetes', 'FIL-PES', 'Cava Fría', 6.50, 4.50, 5, [['Mero', '1kg', 6, true], ['Merluza', '1kg', 4, true]]],
      ['Camarón', 'Pescados y Mariscos', 'Mariscos', 'CAM-MAR', 'Cava Fría', 12.00, 8.50, 3, [['Grande', '1kg', 4, true], ['Mediano', '1kg', 0, true]]],
    ],
  },
  {
    id: 'estetica', label: 'Centros de Estética', emoji: '✨',
    storeName: 'Centro de Estética Renovar · Local Centro',
    dim1: 'Presentación', dim1Example: '200ml', dim2: null,
    suppliers: ['Distribuidora Dermocosmética', 'Insumos Estéticos Bella Piel'],
    categories: ['Cuidado Facial', 'Cuidado Corporal', 'Cuidado Solar'],
    products: [
      ['Sérum Facial Vitamina C', 'Cuidado Facial', 'Sérums', 'SER-VITC', 'Estante 1', 22.00, 11.00, 4, [['30ml', '', 6]]],
      ['Mascarilla de Arcilla', 'Cuidado Facial', 'Mascarillas', 'MAS-ARC', 'Estante 1', 9.50, 4.50, 5, [['150ml', '', 8]]],
      ['Crema Anticelulítica', 'Cuidado Corporal', 'Cremas Corporales', 'CRE-ANT', 'Estante 2', 18.00, 9.00, 3, [['200ml', '', 5]]],
      ['Aceite Corporal Relajante', 'Cuidado Corporal', 'Aceites', 'ACE-COR', 'Estante 2', 14.00, 7.00, 4, [['200ml', '', 6]]],
      ['Protector Solar FPS 50', 'Cuidado Solar', 'Protectores', 'PRO-SOL', 'Estante 3', 16.00, 8.50, 5, [['120ml', '', 7]]],
      ['Exfoliante Corporal', 'Cuidado Corporal', 'Exfoliantes', 'EXF-COR', 'Estante 2', 11.00, 5.50, 4, [['200g', '', 5]]],
    ],
  },
  {
    id: 'decoracion', label: 'Decoración y Textil', emoji: '🖼️',
    storeName: 'Decoración & Textiles Casa Linda · Local Centro',
    dim1: 'Tamaño', dim1Example: 'Matrimonial', dim2: 'Color', dim2Example: 'Beige',
    suppliers: ['Textiles del Hogar Andino', 'Distribuidora de Decoración Import'],
    categories: ['Textil de Cama', 'Cortinas', 'Decoración', 'Baño'],
    products: [
      ['Juego de Sábanas', 'Textil de Cama', 'Sábanas', 'SAB-JUE', 'Estante 1', 22.00, 12.00, 4, [['Matrimonial', 'Blanco', 6], ['Queen', 'Beige', 3]]],
      ['Cortina Blackout', 'Cortinas', 'Blackout', 'COR-BLA', 'Estante 2', 28.00, 16.00, 3, [['1.5x2.2m', 'Gris', 5], ['2x2.2m', 'Gris', 2]]],
      ['Cojín Decorativo', 'Decoración', 'Cojines', 'COJ-DEC', 'Estante 3', 8.50, 4.00, 6, [['45x45cm', 'Beige', 10], ['45x45cm', 'Terracota', 6]]],
      ['Alfombra de Sala', 'Decoración', 'Alfombras', 'ALF-SAL', 'Estante 3', 45.00, 26.00, 2, [['1.6x2.3m', 'Gris', 3]]],
      ['Toalla de Baño', 'Baño', 'Toallas', 'TOA-BAN', 'Estante 4', 9.00, 4.50, 6, [['70x140cm', 'Blanco', 10], ['70x140cm', 'Celeste', 6]]],
      ['Cuadro Decorativo', 'Decoración', 'Cuadros', 'CUA-DEC', 'Estante 3', 15.00, 7.50, 4, [['60x40cm', '', 6]]],
    ],
  },
  {
    id: 'electrodomesticos', label: 'Electrodomésticos', emoji: '🔌',
    storeName: 'Electrohogar Total · Local Centro',
    dim1: 'Capacidad', dim1Example: '18 pies', dim2: 'Color', dim2Example: 'Blanco',
    suppliers: ['Distribuidora de Línea Blanca', 'Importadora de Electrodomésticos'],
    categories: ['Refrigeración', 'Lavado', 'Cocina', 'Climatización'],
    products: [
      ['Nevera 18 Pies', 'Refrigeración', 'Neveras', 'NEV-18P', 'Depósito', 620.00, 480.00, 1, [['18 pies', 'Blanco', 2], ['18 pies', 'Gris', 1]]],
      ['Lavadora Automática', 'Lavado', 'Lavadoras', 'LAV-AUT', 'Depósito', 380.00, 290.00, 1, [['16kg', 'Blanco', 2]]],
      ['Microondas Digital', 'Cocina', 'Microondas', 'MIC-DIG', 'Vitrina 1', 65.00, 45.00, 2, [['20L', 'Negro', 4], ['20L', 'Blanco', 2]]],
      ['Licuadora de Vaso', 'Cocina', 'Licuadoras', 'LIC-VAS', 'Vitrina 1', 28.00, 17.00, 4, [['1.5L', 'Negro', 6], ['1.5L', 'Rojo', 3]]],
      ['Aire Acondicionado Split', 'Climatización', 'Aires', 'AIR-SPL', 'Depósito', 340.00, 260.00, 1, [['12000 BTU', 'Blanco', 2]]],
      ['Ventilador de Pie', 'Climatización', 'Ventiladores', 'VEN-PIE', 'Vitrina 2', 22.00, 13.00, 4, [['16 pulgadas', 'Negro', 5], ['16 pulgadas', 'Blanco', 2]]],
    ],
  },
  {
    id: 'ferreteria', label: 'Ferreterías', emoji: '🔧',
    storeName: 'Ferretería El Tornillo · Local Centro',
    dim1: 'Medida', dim1Example: '1/2 pulgada', dim2: null,
    suppliers: ['Distribuidora de Materiales de Construcción', 'Importadora de Herramientas'],
    categories: ['Construcción', 'Pinturas', 'Eléctrico', 'Herramientas'],
    products: [
      ['Cemento Gris', 'Construcción', 'Cemento', 'CEM-GRI', 'Depósito', 8.50, 6.20, 15, [['Saco 42.5kg', '', 30]]],
      ['Tornillo Autorroscante', 'Construcción', 'Tornillería', 'TOR-AUT', 'Estante 1', 0.05, 0.02, 200, [['1 pulgada', '', 5000], ['2 pulgadas', '', 3000]]],
      ['Pintura de Caucho', 'Pinturas', 'Caucho', 'PIN-CAU', 'Estante 2', 18.00, 12.50, 6, [['1 galón', 'Blanco', 10], ['1 galón', 'Azul', 4]]],
      ['Cable Eléctrico THW', 'Eléctrico', 'Cables', 'CAB-THW', 'Estante 3', 0.60, 0.35, 50, [['Calibre 12 (metro)', '', 300]]],
      ['Candado de Seguridad', 'Herramientas', 'Candados', 'CAN-SEG', 'Estante 4', 6.50, 3.50, 8, [['40mm', '', 15], ['50mm', '', 9]]],
      ['Taladro Eléctrico', 'Herramientas', 'Eléctricas', 'TAL-ELE', 'Vitrina 1', 45.00, 32.00, 3, [['1/2 pulgada', '', 5]]],
    ],
  },
  {
    id: 'fruteria', label: 'Fruterías y Verdulerías', emoji: '🍎',
    storeName: 'Frutería El Manantial · Mercado Municipal',
    dim1: 'Presentación', dim1Example: 'Kg', dim2: null,
    suppliers: ['Central de Abastos Turmero', 'Agropecuaria La Cosecha'],
    categories: ['Frutas', 'Verduras', 'Tubérculos'],
    products: [
      ['Manzana Roja', 'Frutas', 'Frutas de Pepa', 'MAN-ROJ', 'Cava 1', 1.20, 0.70, 10, [['Kg', '', 35, true], ['Bolsa 5 unidades', '', 12]]],
      ['Cambur', 'Frutas', 'Frutas Tropicales', 'CAM-TIT', 'Cava 1', 0.80, 0.40, 8, [['Kg', '', 40, true]]],
      ['Tomate', 'Verduras', 'Hortalizas', 'TOM-PER', 'Cava 2', 1.00, 0.55, 10, [['Kg', '', 25, true], ['Caja 10kg', '', 2]]],
      ['Lechuga', 'Verduras', 'Hojas Verdes', 'LEC-CRE', 'Cava 2', 0.90, 0.45, 6, [['Unidad', '', 18]]],
      ['Papa', 'Tubérculos', 'Raíces', 'PAP-BLA', 'Depósito', 1.10, 0.60, 15, [['Kg', '', 50, true], ['Saco 25kg', '', 3]]],
      ['Aguacate', 'Frutas', 'Frutas Tropicales', 'AGU-HAS', 'Cava 1', 1.50, 0.85, 5, [['Kg', '', 14, true], ['Unidad', '', 20]]],
    ],
  },
  {
    id: 'informatica', label: 'Informática y Componentes', emoji: '💻',
    storeName: 'InfoTech Componentes · Local Centro',
    dim1: 'Modelo', dim1Example: '16GB RAM', dim2: 'Color', dim2Example: 'Gris',
    suppliers: ['Mayorista de Tecnología Andina', 'Componentes PC Import'],
    categories: ['Laptops', 'Periféricos', 'Almacenamiento', 'Componentes'],
    products: [
      ['Laptop Core i5', 'Laptops', 'Portátiles', 'LAP-I5', 'Vitrina 1', 480.00, 380.00, 1, [['8GB/256GB', 'Gris', 2], ['16GB/512GB', 'Gris', 1]]],
      ['Mouse Inalámbrico', 'Periféricos', 'Mouse', 'MOU-INA', 'Estante 1', 9.00, 4.50, 6, [['Estándar', 'Negro', 10], ['Estándar', 'Blanco', 6]]],
      ['Teclado Mecánico', 'Periféricos', 'Teclados', 'TEC-MEC', 'Estante 1', 28.00, 16.00, 3, [['Español', 'Negro', 5], ['Español', 'Blanco', 2]]],
      ['Memoria USB 64GB', 'Almacenamiento', 'USB', 'USB-064', 'Estante 2', 6.50, 3.00, 8, [['64GB', '', 12]]],
      ['Disco SSD 480GB', 'Almacenamiento', 'SSD', 'SSD-480', 'Estante 2', 32.00, 22.00, 3, [['480GB', '', 6], ['1TB', '', 2]]],
      ['Monitor 24 Pulgadas', 'Componentes', 'Monitores', 'MON-24P', 'Vitrina 2', 110.00, 85.00, 2, [['Full HD', 'Negro', 3]]],
    ],
  },
  {
    id: 'joyeria', label: 'Joyerías y Relojerías', emoji: '💍',
    storeName: 'Joyería Diamante · Local Centro',
    dim1: 'Material', dim1Example: 'Oro 18k', dim2: 'Talla', dim2Example: '7',
    suppliers: ['Casa de Oro Caracas', 'Relojería Suiza Import'],
    categories: ['Anillos', 'Cadenas y Dijes', 'Relojes', 'Aretes y Pulseras'],
    products: [
      ['Anillo Solitario', 'Anillos', 'Compromiso', 'ANI-SOL', 'Vitrina 1', 320.00, 210.00, 2, [['Oro 18k', '6', 1], ['Oro 18k', '7', 1], ['Plata 925', '7', 3]]],
      ['Cadena Cubana', 'Cadenas y Dijes', 'Cadenas', 'CAD-CUB', 'Vitrina 2', 180.00, 120.00, 2, [['Oro 18k', '50cm', 2], ['Plata 925', '50cm', 4]]],
      ['Reloj Clásico', 'Relojes', 'Pulsera', 'REL-CLA', 'Vitrina 3', 95.00, 55.00, 3, [['Acero', '', 5], ['Cuero', '', 3]]],
      ['Reloj Deportivo', 'Relojes', 'Deportivo', 'REL-DEP', 'Vitrina 3', 65.00, 38.00, 3, [['Acero', '', 6], ['Silicona', '', 0]]],
      ['Aretes de Perla', 'Aretes y Pulseras', 'Aretes', 'ARE-PER', 'Vitrina 4', 45.00, 25.00, 4, [['Plata 925', '', 7], ['Oro 18k', '', 2]]],
      ['Pulsera de Plata', 'Aretes y Pulseras', 'Pulseras', 'PUL-PLA', 'Vitrina 4', 38.00, 20.00, 4, [['Plata 925', '16cm', 6], ['Plata 925', '18cm', 3]]],
    ],
  },
  {
    id: 'libreria', label: 'Librerías y Papelerías', emoji: '📚',
    storeName: 'Librería y Papelería El Saber · Local Centro',
    dim1: 'Presentación', dim1Example: '100 hojas', dim2: null,
    suppliers: ['Distribuidora Escolar Andina', 'Papelera Nacional'],
    categories: ['Cuadernos y Papel', 'Escritura', 'Escolares', 'Oficina'],
    products: [
      ['Cuaderno Universitario', 'Cuadernos y Papel', 'Cuadernos', 'CUA-UNI', 'Estante 1', 3.50, 1.80, 10, [['100 hojas', '', 30], ['200 hojas', '', 15]]],
      ['Resma de Papel Carta', 'Cuadernos y Papel', 'Papel', 'RES-CAR', 'Estante 1', 5.50, 3.50, 6, [['500 hojas', '', 12]]],
      ['Bolígrafo Azul', 'Escritura', 'Bolígrafos', 'BOL-AZU', 'Estante 2', 0.50, 0.20, 30, [['Punta fina', '', 80], ['Punta media', '', 50]]],
      ['Marcador Permanente', 'Escritura', 'Marcadores', 'MAR-PER', 'Estante 2', 1.20, 0.55, 10, [['Negro', '', 20], ['Rojo', '', 10]]],
      ['Mochila Escolar', 'Escolares', 'Mochilas', 'MOC-ESC', 'Vitrina 1', 25.00, 14.00, 4, [['Estándar', '', 8]]],
      ['Calculadora Científica', 'Oficina', 'Calculadoras', 'CAL-CIE', 'Estante 3', 12.00, 7.00, 4, [['Básica', '', 6]]],
    ],
  },
  {
    id: 'marroquineria', label: 'Marroquinerías', emoji: '👜',
    storeName: 'Marroquinería Cuero Fino · Local Centro',
    dim1: 'Color', dim1Example: 'Negro', dim2: 'Tamaño', dim2Example: 'Mediano',
    suppliers: ['Cueros Maracay', 'Talabartería San José'],
    categories: ['Carteras', 'Bolsos', 'Billeteras', 'Maletines'],
    products: [
      ['Cartera de Cuero', 'Carteras', 'Mano', 'CAR-CUE', 'Vitrina 1', 42.00, 22.00, 4, [['Negro', 'Mediano', 6], ['Marrón', 'Mediano', 4], ['Negro', 'Grande', 0]]],
      ['Bolso Tote', 'Bolsos', 'Tote', 'BOL-TOT', 'Vitrina 2', 55.00, 30.00, 3, [['Negro', 'Grande', 4], ['Camel', 'Grande', 2]]],
      ['Billetera de Hombre', 'Billeteras', 'Hombre', 'BIL-HOM', 'Vitrina 3', 18.00, 8.50, 8, [['Negro', '', 12], ['Marrón', '', 7]]],
      ['Maletín Ejecutivo', 'Maletines', 'Ejecutivo', 'MAL-EJE', 'Vitrina 4', 68.00, 38.00, 2, [['Negro', '', 3], ['Marrón', '', 1]]],
      ['Mochila de Cuero', 'Bolsos', 'Mochilas', 'MOC-CUE', 'Vitrina 2', 60.00, 32.00, 3, [['Negro', '', 3], ['Marrón', '', 0]]],
      ['Cinturón de Cuero', 'Billeteras', 'Cinturones', 'CIN-CUE', 'Vitrina 3', 20.00, 9.00, 6, [['Negro', '', 10], ['Marrón', '', 5]]],
    ],
  },
  {
    id: 'mueblerias', label: 'Mueblerías y Colchonerías', emoji: '🛋️',
    storeName: 'Muebles y Colchones del Hogar · Local Centro',
    dim1: 'Tamaño', dim1Example: 'Queen', dim2: 'Color', dim2Example: 'Gris',
    suppliers: ['Fábrica de Colchones Dormisano', 'Ebanistería El Roble'],
    categories: ['Colchones', 'Salas', 'Comedores', 'Dormitorios'],
    products: [
      ['Colchón Ortopédico', 'Colchones', 'Ortopédicos', 'COL-ORT', 'Depósito', 220.00, 150.00, 2, [['Individual', '', 3], ['Matrimonial', '', 2], ['Queen', '', 1]]],
      ['Sofá 3 Puestos', 'Salas', 'Sofás', 'SOF-3PT', 'Sala Exhibición', 350.00, 240.00, 1, [['Gris', 'Tela', 2], ['Beige', 'Tela', 1]]],
      ['Mesa de Comedor', 'Comedores', 'Mesas', 'MES-COM', 'Sala Exhibición', 180.00, 120.00, 1, [['4 puestos', 'Madera', 2], ['6 puestos', 'Madera', 1]]],
      ['Silla de Comedor', 'Comedores', 'Sillas', 'SIL-COM', 'Sala Exhibición', 28.00, 16.00, 4, [['Estándar', 'Madera', 8], ['Estándar', 'Negro', 5]]],
      ['Ropero 3 Cuerpos', 'Dormitorios', 'Roperos', 'ROP-3CU', 'Depósito', 260.00, 175.00, 1, [['3 cuerpos', 'Blanco', 2], ['3 cuerpos', 'Wengué', 1]]],
      ['Cama Individual', 'Dormitorios', 'Camas', 'CAM-IND', 'Depósito', 130.00, 85.00, 2, [['Individual', 'Blanco', 3]]],
    ],
  },
  {
    id: 'optica', label: 'Ópticas', emoji: '👓',
    storeName: 'Óptica Visión Clara · Local Centro',
    dim1: 'Modelo', dim1Example: 'Aviador', dim2: 'Color', dim2Example: 'Negro',
    suppliers: ['Importadora de Lentes y Monturas', 'Laboratorio Óptico Central'],
    categories: ['Lentes de Sol', 'Armazones', 'Lentes de Contacto', 'Accesorios'],
    products: [
      ['Lente de Sol Aviador', 'Lentes de Sol', 'Aviador', 'LEN-AVI', 'Vitrina 1', 32.00, 16.00, 4, [['Aviador', 'Dorado', 5], ['Aviador', 'Negro', 3]]],
      ['Armazón Clásico', 'Armazones', 'Clásico', 'ARM-CLA', 'Vitrina 2', 45.00, 24.00, 3, [['Rectangular', 'Negro', 4], ['Redondo', 'Carey', 2]]],
      ['Lente de Contacto Mensual', 'Lentes de Contacto', 'Mensuales', 'LEN-CONT', 'Estante 1', 18.00, 10.00, 5, [['Caja x6', '', 8]]],
      ['Líquido Limpiador de Lentes', 'Accesorios', 'Limpieza', 'LIQ-LIM', 'Estante 2', 5.00, 2.20, 6, [['355ml', '', 10]]],
      ['Estuche para Lentes', 'Accesorios', 'Estuches', 'EST-LEN', 'Estante 2', 6.50, 3.00, 6, [['Rígido', 'Negro', 10], ['Blando', 'Azul', 5]]],
      ['Cadena para Lentes', 'Accesorios', 'Cadenas', 'CAD-LEN', 'Estante 2', 4.50, 2.00, 5, [['Metálica', '', 8]]],
    ],
  },
  {
    id: 'panaderia', label: 'Panaderías y Pastelerías', emoji: '🥐',
    storeName: 'Panadería Doña Rosa · Local Centro',
    dim1: 'Tamaño', dim1Example: 'Individual', dim2: null,
    suppliers: ['Molinos San Rafael', 'Insumos de Pastelería Delicia'],
    categories: ['Panadería Salada', 'Pastelería Dulce', 'Bebidas Calientes'],
    products: [
      ['Pan Francés', 'Panadería Salada', 'Panes', 'PAN-FRA', 'Vitrina 1', 0.60, 0.25, 30, [['Unidad', '', 80], ['Docena', '', 10]]],
      ['Cachito de Jamón y Queso', 'Panadería Salada', 'Panes Rellenos', 'CAC-JYQ', 'Vitrina 1', 1.20, 0.55, 20, [['Unidad', '', 35]]],
      ['Torta de Chocolate', 'Pastelería Dulce', 'Tortas', 'TOR-CHO', 'Vitrina 2', 18.00, 8.50, 3, [['Porción', '', 12], ['Entera 20cm', '', 2]]],
      ['Croissant', 'Pastelería Dulce', 'Bollería', 'CRO-CLA', 'Vitrina 1', 1.50, 0.65, 15, [['Unidad', '', 20]]],
      ['Café con Leche', 'Bebidas Calientes', 'Café', 'CAF-CLE', 'Barra', 1.80, 0.60, 5, [['Chico', '', 40], ['Grande', '', 25]]],
      ['Ponqué Marmoleado', 'Pastelería Dulce', 'Tortas', 'PON-MAR', 'Vitrina 2', 6.50, 3.00, 4, [['Individual', '', 8], ['Grande', '', 3]]],
    ],
  },
  {
    id: 'perfumeria', label: 'Perfumerías y Tiendas de Cosméticos', emoji: '💄',
    storeName: 'Perfumería Esencia · Local Centro',
    dim1: 'Presentación', dim1Example: '50ml', dim2: 'Fragancia', dim2Example: 'Floral',
    suppliers: ['Distribuidora de Fragancias Import', 'Cosméticos La Bella'],
    categories: ['Perfumes', 'Maquillaje', 'Cuidado Facial', 'Cuidado Corporal'],
    products: [
      ['Perfume de Mujer', 'Perfumes', 'Mujer', 'PER-MUJ', 'Vitrina 1', 45.00, 25.00, 3, [['50ml', 'Floral', 5], ['100ml', 'Floral', 2], ['50ml', 'Frutal', 4]]],
      ['Perfume de Hombre', 'Perfumes', 'Hombre', 'PER-HOM', 'Vitrina 1', 48.00, 27.00, 3, [['100ml', 'Amaderado', 4], ['50ml', 'Cítrico', 3]]],
      ['Base de Maquillaje', 'Maquillaje', 'Rostro', 'BAS-MAQ', 'Vitrina 2', 15.00, 7.50, 5, [['30ml', 'Claro', 6], ['30ml', 'Medio', 8], ['30ml', 'Oscuro', 3]]],
      ['Labial Mate', 'Maquillaje', 'Labios', 'LAB-MAT', 'Vitrina 2', 6.50, 2.80, 8, [['4g', 'Rojo', 10], ['4g', 'Nude', 7], ['4g', 'Coral', 5]]],
      ['Crema Facial Hidratante', 'Cuidado Facial', 'Cremas', 'CRE-FAC', 'Vitrina 3', 12.00, 6.00, 4, [['50ml', '', 8]]],
      ['Desodorante en Barra', 'Cuidado Corporal', 'Desodorantes', 'DES-BAR', 'Vitrina 3', 3.50, 1.60, 10, [['50g', 'Original', 12], ['50g', 'Sport', 9]]],
    ],
  },
  {
    id: 'belleza', label: 'Salones de Belleza y Barberías', emoji: '💇',
    storeName: 'Salón Glamour · Local Centro',
    dim1: 'Presentación', dim1Example: '300ml', dim2: 'Tono', dim2Example: 'Rubio Cenizo',
    suppliers: ['Distribuidora de Belleza Cosmoprof', 'Insumos de Barbería El Corte'],
    categories: ['Cuidado Capilar', 'Coloración', 'Cuidado de Barba', 'Uñas'],
    products: [
      ['Shampoo Profesional', 'Cuidado Capilar', 'Shampoos', 'SHA-PRO', 'Estante 1', 12.00, 6.50, 5, [['300ml', '', 10], ['1L', '', 4]]],
      ['Tinte para Cabello', 'Coloración', 'Tintes', 'TIN-CAB', 'Estante 2', 8.50, 4.20, 6, [['60ml', 'Rubio Cenizo', 8], ['60ml', 'Castaño Oscuro', 6], ['60ml', 'Negro', 3]]],
      ['Cera para Barba', 'Cuidado de Barba', 'Ceras', 'CER-BAR', 'Estante 3', 9.00, 4.50, 4, [['50g', '', 7], ['100g', '', 2]]],
      ['Aceite para Barba', 'Cuidado de Barba', 'Aceites', 'ACE-BAR', 'Estante 3', 7.50, 3.50, 4, [['30ml', '', 6]]],
      ['Esmalte de Uñas', 'Uñas', 'Esmaltes', 'ESM-UÑA', 'Estante 4', 4.00, 1.80, 8, [['15ml', 'Rojo Clásico', 12], ['15ml', 'Nude', 9], ['15ml', 'Negro', 4]]],
      ['Crema de Peinar', 'Cuidado Capilar', 'Cremas', 'CRE-PEI', 'Estante 1', 6.50, 3.00, 5, [['250ml', '', 8]]],
    ],
  },
  {
    id: 'supermercado', label: 'Supermercados y Minimercados', emoji: '🛒',
    storeName: 'Mini Market La Esquina · Local Centro',
    dim1: 'Presentación', dim1Example: '1kg', dim2: 'Marca', dim2Example: 'Mary',
    suppliers: ['Distribuidora Central de Alimentos', 'Mayorista Polar'],
    categories: ['Abarrotes', 'Lácteos y Refrigerados', 'Limpieza del Hogar', 'Bebidas', 'Verduras y Frutas', 'Carnicería'],
    products: [
      ['Arroz Blanco', 'Abarrotes', 'Granos', 'ARR-BLA', 'Pasillo 1, Estante A', 1.80, 1.10, 25, [['1kg', 'Mary', 48], ['1kg', 'Primor', 30], ['5kg', 'Mary', 10]]],
      ['Aceite de Maíz', 'Abarrotes', 'Aceites', 'ACE-MAI', 'Pasillo 1, Estante B', 3.20, 2.10, 15, [['1L', 'Mazeite', 20], ['1L', 'Vatel', 14], ['3L', 'Mazeite', 0]]],
      ['Leche Completa', 'Lácteos y Refrigerados', 'Leches', 'LEC-COM', 'Nevera 1', 2.50, 1.60, 20, [['1L', 'Los Andes', 18], ['1L', 'Nestlé', 9], ['900g Polvo', 'Nido', 3]]],
      ['Detergente en Polvo', 'Limpieza del Hogar', 'Detergentes', 'DET-POL', 'Pasillo 3, Estante A', 4.50, 2.80, 10, [['1kg', 'Ace', 12], ['1kg', 'Fab', 6], ['3kg', 'Ace', 0]]],
      ['Refresco Cola', 'Bebidas', 'Gaseosas', 'REF-COL', 'Pasillo 4, Estante A', 1.50, 0.85, 24, [['1.5L', 'Coca-Cola', 30], ['2L', 'Pepsi', 16], ['355ml Lata', 'Coca-Cola', 40]]],
      ['Papel Higiénico', 'Limpieza del Hogar', 'Papelería', 'PAP-HIG', 'Pasillo 3, Estante B', 3.80, 2.40, 12, [['x4 rollos', 'Rosal', 15], ['x12 rollos', 'Rosal', 4]]],
      ['Tomate a Granel', 'Verduras y Frutas', 'Hortalizas', 'TOM-GRA', 'Sección Verduras', 1.00, 0.55, 5, [['Kg', '', 20, true]]],
      ['Cambur a Granel', 'Verduras y Frutas', 'Frutas', 'CAM-GRA', 'Sección Verduras', 0.80, 0.40, 5, [['Kg', '', 25, true]]],
      ['Carne Molida a Granel', 'Carnicería', 'Molidas', 'CAR-GRA', 'Sección Carnicería', 5.50, 3.80, 3, [['Kg', '', 12, true]]],
      ['Pechuga de Pollo a Granel', 'Carnicería', 'Pollo', 'POL-GRA', 'Sección Carnicería', 4.20, 2.90, 3, [['Kg', '', 15, true]]],
    ],
  },
  {
    id: 'deportivos', label: 'Tiendas de Artículos Deportivos', emoji: '🏀',
    storeName: 'Deportes Total · Local Centro',
    dim1: 'Talla', dim1Example: 'M', dim2: 'Color', dim2Example: 'Azul',
    suppliers: ['Distribuidora Deportiva Nacional', 'Importadora de Artículos Deportivos'],
    categories: ['Indumentaria Deportiva', 'Calzado Deportivo', 'Balones', 'Fitness'],
    products: [
      ['Camiseta Deportiva', 'Indumentaria Deportiva', 'Camisetas', 'CAM-DEP', 'Pasillo 1, Estante A', 18.00, 9.00, 6, [['S', 'Azul', 8], ['M', 'Azul', 10], ['L', 'Rojo', 4]]],
      ['Short Deportivo', 'Indumentaria Deportiva', 'Shorts', 'SHO-DEP', 'Pasillo 1, Estante A', 12.00, 6.00, 6, [['M', 'Negro', 9], ['L', 'Negro', 6]]],
      ['Zapatilla Running', 'Calzado Deportivo', 'Running', 'ZAP-RUN', 'Pasillo 2, Estante A', 55.00, 36.00, 4, [['40', 'Negro', 5], ['41', 'Negro', 3], ['42', 'Blanco', 0]]],
      ['Balón de Fútbol', 'Balones', 'Fútbol', 'BAL-FUT', 'Vitrina 1', 22.00, 12.00, 5, [['N°5', 'Blanco/Negro', 8]]],
      ['Guantes de Boxeo', 'Fitness', 'Boxeo', 'GUA-BOX', 'Estante 1', 28.00, 16.00, 3, [['12oz', 'Negro', 4], ['14oz', 'Rojo', 2]]],
      ['Mancuernas 5kg (par)', 'Fitness', 'Pesas', 'MAN-5KG', 'Estante 2', 20.00, 13.00, 3, [['5kg', 'Negro', 5], ['10kg', 'Negro', 2]]],
    ],
  },
  {
    id: 'petshop', label: 'Tiendas de Mascotas (Pet Shops)', emoji: '🐾',
    storeName: 'Pet Shop Amigo Fiel · Local Centro',
    dim1: 'Presentación', dim1Example: '10kg', dim2: null,
    suppliers: ['Distribuidora de Alimento Balanceado', 'Importadora de Accesorios para Mascotas'],
    categories: ['Alimento para Perros', 'Alimento para Gatos', 'Accesorios', 'Higiene'],
    products: [
      ['Alimento para Perro Adulto', 'Alimento para Perros', 'Balanceado', 'ALI-PER', 'Estante 1', 28.00, 19.00, 4, [['10kg', '', 8], ['3kg', '', 10]]],
      ['Alimento para Gato Adulto', 'Alimento para Gatos', 'Balanceado', 'ALI-GAT', 'Estante 1', 22.00, 15.00, 4, [['7.5kg', '', 6], ['3kg', '', 9]]],
      ['Juguete para Perro', 'Accesorios', 'Juguetes', 'JUG-PER', 'Estante 2', 5.50, 2.50, 8, [['Pelota', '', 12], ['Cuerda', '', 9]]],
      ['Correa Ajustable', 'Accesorios', 'Paseo', 'COR-AJU', 'Estante 2', 8.00, 4.00, 6, [['Raza pequeña', '', 10], ['Raza grande', '', 6]]],
      ['Arena Sanitaria', 'Higiene', 'Arena', 'ARE-SAN', 'Estante 3', 9.50, 5.50, 5, [['4kg', '', 10]]],
      ['Shampoo para Mascotas', 'Higiene', 'Shampoos', 'SHA-MAS', 'Estante 3', 7.50, 3.80, 5, [['400ml', '', 8]]],
    ],
  },
  {
    id: 'ropa', label: 'Tiendas de Ropa', emoji: '👕',
    storeName: 'Urbana Store · Local Centro',
    dim1: 'Talla', dim1Example: 'M', dim2: 'Color', dim2Example: 'Negro',
    suppliers: ['Textiles del Sur', 'Distribuidora Andina'],
    categories: ['Indumentaria', 'Calzado', 'Accesorios'],
    products: [
      ['Camiseta Básica', 'Indumentaria', 'Camisetas', 'CAM-BAS', 'Pasillo 1, Estante A', 12.5, 5.2, 8, [['S', 'Blanco', 14], ['M', 'Blanco', 18], ['L', 'Blanco', 6], ['S', 'Negro', 2], ['M', 'Negro', 9], ['L', 'Negro', 0]]],
      ['Jean Slim Fit', 'Indumentaria', 'Pantalones', 'JEA-SLM', 'Pasillo 1, Estante C', 34.9, 26.0, 6, [['38', 'Azul', 5], ['40', 'Azul', 7], ['42', 'Azul', 1], ['38', 'Negro', 0], ['40', 'Negro', 4]]],
      ['Campera Denim', 'Indumentaria', 'Abrigos', 'CAM-DNM', 'Pasillo 1, Estante D', 52.0, 24.0, 4, [['S', 'Azul', 0], ['M', 'Azul', 0], ['L', 'Azul', 0]]],
      ['Buzo Canguro', 'Indumentaria', 'Abrigos', 'BUZ-CNG', 'Pasillo 1, Estante D', 28.0, 12.5, 6, [['S', 'Gris', 9], ['M', 'Gris', 11], ['L', 'Gris', 3], ['M', 'Negro', 0]]],
      ['Zapatilla Runner', 'Calzado', 'Zapatillas', 'ZAP-RUN', 'Pasillo 2, Estante A', 68.0, 58.0, 5, [['39', 'Negro', 4], ['40', 'Negro', 6], ['41', 'Negro', 2], ['42', 'Blanco', 0], ['43', 'Blanco', 5]]],
      ['Bota Urbana', 'Calzado', 'Botas', 'BOT-URB', 'Pasillo 2, Estante B', 74.5, 55.0, 4, [['39', 'Marrón', 1], ['40', 'Marrón', 1], ['41', 'Negro', 0], ['42', 'Negro', 1]]],
      ['Sandalia Verano', 'Calzado', 'Sandalias', 'SAN-VER', 'Pasillo 2, Estante C', 22.0, 9.0, 6, [['37', 'Beige', 10], ['38', 'Beige', 12], ['39', 'Negro', 1]]],
      ['Gorra Snapback', 'Accesorios', 'Gorras', 'GOR-SNP', 'Pasillo 3, Estante A', 15.0, 6.0, 10, [['Único', 'Negro', 20], ['Único', 'Azul', 13], ['Único', 'Rojo', 0]]],
      ['Mochila Urbana', 'Accesorios', 'Mochilas', 'MOC-URB', 'Pasillo 3, Estante B', 39.0, 18.0, 5, [['Único', 'Negro', 2], ['Único', 'Gris', 1]]],
      ['Cinturón de Cuero', 'Accesorios', 'Cinturones', 'CIN-CUE', 'Pasillo 3, Estante C', 18.5, 7.5, 8, [['S', 'Marrón', 6], ['M', 'Marrón', 9], ['L', 'Marrón', 1], ['M', 'Negro', 0]]],
    ],
  },
  {
    id: 'telefonia', label: 'Tiendas de Telefonía', emoji: '📱',
    storeName: 'TeleCenter Móvil · Local Centro',
    dim1: 'Modelo', dim1Example: '128GB', dim2: 'Color', dim2Example: 'Negro',
    suppliers: ['Importadora de Tecnología Móvil', 'Accesorios CellShop'],
    categories: ['Celulares', 'Accesorios', 'Audio', 'Protección'],
    products: [
      ['Smartphone Gama Media', 'Celulares', 'Android', 'SMA-GM1', 'Vitrina 1', 180.00, 140.00, 2, [['128GB', 'Negro', 4], ['128GB', 'Azul', 2], ['256GB', 'Negro', 1]]],
      ['Funda Protectora', 'Protección', 'Fundas', 'FUN-PRO', 'Estante 1', 6.00, 2.50, 8, [['iPhone 13', 'Transparente', 12], ['iPhone 13', 'Negro', 9], ['Samsung A54', 'Negro', 6]]],
      ['Vidrio Templado', 'Protección', 'Vidrios', 'VID-TEM', 'Estante 1', 4.00, 1.50, 10, [['Universal', '', 20]]],
      ['Cargador Tipo C', 'Accesorios', 'Cargadores', 'CAR-TIC', 'Estante 2', 8.50, 4.00, 6, [['20W', 'Blanco', 10], ['20W', 'Negro', 7]]],
      ['Audífonos Bluetooth', 'Audio', 'Inalámbricos', 'AUD-BLT', 'Vitrina 2', 25.00, 14.00, 4, [['Blanco', '', 6], ['Negro', '', 5]]],
      ['Power Bank 10000mAh', 'Accesorios', 'Baterías', 'POW-BAN', 'Estante 2', 15.00, 8.50, 4, [['Negro', '', 5], ['Blanco', '', 3]]],
    ],
  },
  {
    id: 'vivero', label: 'Viveros y Floristerías', emoji: '🌿',
    storeName: 'Vivero y Floristería Jardín Verde · Local Centro',
    dim1: 'Presentación', dim1Example: 'Maceta 15cm', dim2: null,
    suppliers: ['Vivero Central de Plantas', 'Distribuidora Floral del Valle'],
    categories: ['Plantas Ornamentales', 'Flores', 'Cactus y Suculentas', 'Jardinería'],
    products: [
      ['Planta Ornamental Ficus', 'Plantas Ornamentales', 'Interior', 'FIC-ORN', 'Área Exterior', 12.00, 6.50, 4, [['Maceta 20cm', '', 8]]],
      ['Ramo de Rosas', 'Flores', 'Ramos', 'ROS-RAM', 'Cava Fría', 15.00, 7.00, 3, [['12 rosas', '', 10], ['24 rosas', '', 4]]],
      ['Orquídea', 'Plantas Ornamentales', 'Interior', 'ORQ-BLA', 'Área Exterior', 18.00, 10.00, 3, [['Maceta 15cm', '', 6]]],
      ['Cactus Pequeño', 'Cactus y Suculentas', 'Cactus', 'CAC-PEQ', 'Área Exterior', 5.00, 2.20, 6, [['Maceta 10cm', '', 15]]],
      ['Fertilizante Orgánico', 'Jardinería', 'Fertilizantes', 'FER-ORG', 'Estante 1', 6.50, 3.20, 4, [['1kg', '', 10]]],
      ['Maceta de Barro', 'Jardinería', 'Macetas', 'MAC-BAR', 'Estante 2', 4.00, 1.80, 5, [['20cm', '', 12], ['30cm', '', 6]]],
    ],
  },
  {
    id: 'zapateria', label: 'Zapaterías', emoji: '👟',
    storeName: 'Calzados Andino · Local Centro',
    dim1: 'Talla', dim1Example: '40', dim2: 'Color', dim2Example: 'Negro',
    suppliers: ['Distribuidora Andina de Calzado', 'Cueros del Táchira'],
    categories: ['Deportivo', 'Casual', 'Formal', 'Infantil'],
    products: [
      ['Zapatilla Running', 'Deportivo', 'Running', 'ZAP-RUN', 'Pasillo 1, Estante A', 45.00, 28.00, 6, [['38', 'Blanco', 10], ['39', 'Blanco', 8], ['40', 'Negro', 4], ['41', 'Negro', 0]]],
      ['Zapato de Vestir', 'Formal', 'Cuero', 'ZAP-VES', 'Pasillo 2, Estante A', 58.00, 34.00, 4, [['40', 'Negro', 5], ['41', 'Negro', 3], ['42', 'Marrón', 0]]],
      ['Sandalia de Playa', 'Casual', 'Sandalias', 'SAN-PLA', 'Pasillo 1, Estante B', 15.00, 6.50, 8, [['37', 'Beige', 12], ['38', 'Beige', 9], ['39', 'Negro', 2]]],
      ['Bota de Cuero', 'Casual', 'Botas', 'BOT-CUE', 'Pasillo 2, Estante B', 62.00, 40.00, 3, [['38', 'Marrón', 3], ['39', 'Marrón', 1], ['40', 'Negro', 0]]],
      ['Zapato Escolar', 'Infantil', 'Escolar', 'ZAP-ESC', 'Pasillo 3, Estante A', 22.00, 12.00, 6, [['32', 'Negro', 10], ['34', 'Negro', 7], ['36', 'Negro', 2]]],
      ['Mocasín', 'Formal', 'Mocasines', 'MOC-CLA', 'Pasillo 2, Estante A', 40.00, 24.00, 4, [['40', 'Marrón', 4], ['41', 'Marrón', 2], ['42', 'Negro', 0]]],
    ],
  },
];

export const SHOP_RUBROS: ShopRubro[] = RUBRO_DEFS.map((def) => ({
  ...def,
  products: buildProducts(def.id, def.products),
}));

export function getShopRubro(rubroId: string | null | undefined): ShopRubro | undefined {
  return SHOP_RUBROS.find((r) => r.id === rubroId);
}

/** Rubros que venden servicios, no mercancía: sin SKU, sin stock, sin vencimiento. */
const SERVICE_RUBROS = ['estetica', 'belleza'];

export function isServiceRubro(rubroId: string | null | undefined): boolean {
  return !!rubroId && SERVICE_RUBROS.includes(rubroId);
}

/**
 * Funciones habilitadas según el rubro: el formulario de Inventario (y lo que depende de él)
 * solo muestra lo que ese tipo de negocio realmente usa — una carnicería vende por Kg y le
 * importa el vencimiento; una tienda de decoración vende unidades y nada de eso le aplica.
 */
export interface ShopRubroFeatures {
  /** Venta por peso (Kg): 'default' = el rubro vive de pesar (nuevo producto arranca en Kg),
   * 'optional' = algunos productos se pesan (el interruptor aparece, apagado),
   * 'none' = todo es unitario y el interruptor ni aparece. */
  weight: 'default' | 'optional' | 'none';
  /** Fecha de vencimiento + alerta de "por vencer" (perecederos, cosméticos, medicinas). */
  expiry: boolean;
  /** Precio mayorista por cantidad (negocios donde el "al mayor" es parte del día a día). */
  wholesale: boolean;
  /** Impresión por m² desde rollo (vinil/banner) — exclusivo de agencias de publicidad. */
  areaRoll: boolean;
}

const DEFAULT_FEATURES: ShopRubroFeatures = { weight: 'none', expiry: false, wholesale: false, areaRoll: false };

const RUBRO_FEATURES: Record<string, Partial<ShopRubroFeatures>> = {
  agencia_publicidad: { areaRoll: true },
  cafeteria: { weight: 'optional', expiry: true }, // tortas/helado por Kg; todo perecedero
  carniceria: { weight: 'default', expiry: true, wholesale: true }, // el mostrador ES la balanza
  estetica: {}, // servicios — el modo SERVICE ya oculta stock/SKU/vencimiento
  decoracion: {}, // unitario puro: cuadros, cortinas, cojines
  electrodomesticos: {},
  ferreteria: { weight: 'optional', wholesale: true }, // clavos/tornillos por Kg; venta al mayor a maestros de obra
  fruteria: { weight: 'default', expiry: true, wholesale: true }, // balanza + merma diaria
  informatica: {},
  joyeria: {},
  libreria: { wholesale: true }, // temporada escolar: listas al mayor
  marroquineria: {},
  mueblerias: {},
  optica: { expiry: true }, // lentes de contacto y soluciones vencen
  panaderia: { weight: 'optional', expiry: true, wholesale: true }, // torta/charcutería por Kg; pan al mayor a cafés
  perfumeria: { expiry: true }, // cosméticos con fecha
  belleza: {}, // servicios
  supermercado: { weight: 'optional', expiry: true, wholesale: true }, // charcutería/verduras por Kg
  deportivos: {},
  petshop: { weight: 'optional', expiry: true }, // alimento a granel por Kg; alimentos vencen
  ropa: { wholesale: true }, // venta al mayor por docena, muy común
  telefonia: {},
  vivero: {},
  zapateria: {},
};

export function getRubroFeatures(rubroId: string | null | undefined): ShopRubroFeatures {
  return { ...DEFAULT_FEATURES, ...(rubroId ? RUBRO_FEATURES[rubroId] : undefined) };
}
