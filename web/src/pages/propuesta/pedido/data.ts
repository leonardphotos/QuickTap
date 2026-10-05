export type Channel = 'DINE_IN' | 'EXPRESS' | 'BAR' | 'DELIVERY' | 'PICKUP';

export interface MenuProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  tag?: 'Popular' | 'Nuevo';
  hasOptions?: boolean;
  soldOut?: boolean;
}

export interface FloorTable {
  id: string;
  label: string;
  seats: number;
  busy: boolean;
}

export const MENU_CATEGORIES = ['Todos', 'Hamburguesas', 'Pizzas', 'Entradas', 'Bebidas', 'Postres'] as const;

export const MENU: MenuProduct[] = [
  { id: 'p1', name: 'Clásica doble', category: 'Hamburguesas', price: 9.5, description: 'Doble carne, queso cheddar, cebolla caramelizada.', tag: 'Popular', hasOptions: true },
  { id: 'p2', name: 'Smash bacon', category: 'Hamburguesas', price: 10.5, description: 'Carne smash, tocineta crujiente y salsa de la casa.', hasOptions: true },
  { id: 'p3', name: 'Pollo crispy', category: 'Hamburguesas', price: 8.75, description: 'Pechuga empanizada, repollo morado y miel picante.' },
  { id: 'p4', name: 'Veggie de garbanzo', category: 'Hamburguesas', price: 8.25, description: 'Medallón de garbanzo, aguacate y tomate.', tag: 'Nuevo' },
  { id: 'p5', name: 'Margarita', category: 'Pizzas', price: 11, description: 'Tomate, mozzarella fresca y albahaca.', hasOptions: true },
  { id: 'p6', name: 'Pepperoni', category: 'Pizzas', price: 12.5, description: 'Doble pepperoni y orégano.', tag: 'Popular', hasOptions: true },
  { id: 'p7', name: 'Cuatro quesos', category: 'Pizzas', price: 13, description: 'Mozzarella, gouda, parmesano y azul.', soldOut: true },
  { id: 'p8', name: 'Tequeños (6)', category: 'Entradas', price: 5.5, description: 'Con salsa de ajo o guasacaca.', tag: 'Popular' },
  { id: 'p9', name: 'Papas rústicas', category: 'Entradas', price: 4, description: 'Con paprika ahumada y mayonesa de ajo.' },
  { id: 'p10', name: 'Alitas BBQ (8)', category: 'Entradas', price: 8, description: 'Glaseadas en BBQ de papelón.', hasOptions: true },
  { id: 'p11', name: 'Limonada frappé', category: 'Bebidas', price: 3, description: 'Natural o con hierbabuena.' },
  { id: 'p12', name: 'Refresco 355 ml', category: 'Bebidas', price: 1.75, description: 'Cola, naranja o limón.', hasOptions: true },
  { id: 'p13', name: 'Cerveza nacional', category: 'Bebidas', price: 2.5, description: 'Botella de 355 ml, bien fría.' },
  { id: 'p14', name: 'Agua mineral', category: 'Bebidas', price: 1.25, description: 'Con o sin gas.' },
  { id: 'p15', name: 'Brownie con helado', category: 'Postres', price: 4.5, description: 'Brownie tibio y helado de vainilla.', tag: 'Popular' },
  { id: 'p16', name: 'Quesillo', category: 'Postres', price: 3.5, description: 'Receta de la casa.' },
];

export const TABLES: FloorTable[] = [
  { id: 't1', label: 'M1', seats: 2, busy: false },
  { id: 't2', label: 'M2', seats: 4, busy: true },
  { id: 't3', label: 'M3', seats: 4, busy: false },
  { id: 't4', label: 'M4', seats: 6, busy: false },
  { id: 't5', label: 'M5', seats: 2, busy: true },
  { id: 't6', label: 'M6', seats: 4, busy: false },
  { id: 't7', label: 'T1', seats: 2, busy: false },
  { id: 't8', label: 'T2', seats: 2, busy: true },
];

export const SAMPLE_CUSTOMER = { name: 'María González', phone: '0414-555-1234' };

export const DELIVERY_FEE = 2.5;
