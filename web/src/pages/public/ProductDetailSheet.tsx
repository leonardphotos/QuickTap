import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Check, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { CartLine, ComboComponentInfo, ComboSelection, ModifierCategory, Product, Restaurant, SelectedModifier } from '../../types';
import { formatBase, productDisplayPriceBase, publicPriceLabel } from '../../utils/format';
import { effectiveMax, effectiveMin, effectiveModifierPrice, aplicaAlTamano, lineasConGratis, totalGrupoConGratis } from '../../utils/modifierLimits';
import { ComboInstancePicker, ComboPoolSelector, claveComponente } from '@/components/admin/ProductOptionsDialog';
import {
  FamilyDrawerRoot,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerClose,
} from '@/components/ui/family-drawer';

interface Props {
  product: Product | null;
  restaurant: Restaurant;
  allProducts: Product[];
  onClose: () => void;
  onAdd: (line: CartLine, originRect?: DOMRect) => void;
  onSelectProduct: (product: Product) => void;
  /** Al tocar la foto grande de arriba se abre la galería a pantalla completa. */
  onOpenGallery: (product: Product) => void;
  orderingEnabled: boolean;
}

function categoryHint(category: ModifierCategory): string {
  const max = effectiveMax(category);
  const min = effectiveMin(category);
  if (category.allowMultiple && Number.isFinite(max)) {
    if (min > 1) return `Elige al menos ${min} (hasta ${max})`;
    return category.isRequired ? `Elige hasta ${max} (puedes repetir una opción)` : `Opcional · hasta ${max}`;
  }
  if (min > 1) return `Elige al menos ${min} opciones`;
  if (category.isRequired) return category.allowMultiple ? 'Selecciona al menos una opción' : 'Selecciona una opción';
  return category.allowMultiple ? 'Elige las que quieras' : 'Opcional';
}

function pickSuggestions(all: Product[], excludeId: string, count: number): Product[] {
  const pool = all.filter((p) => p.id !== excludeId);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function ProductDetailSheet({
  product,
  restaurant,
  allProducts,
  onClose,
  onAdd,
  onSelectProduct,
  onOpenGallery,
  orderingEnabled,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  // Combo armable: una instancia por unidad de cada plato componente, cada una con su estado.
  // Pool: con mín/máx definidos el comensal elige cuántos de cada plato; sin límites, fijo.
  const esComboPool = product?.comboMinSelections != null || product?.comboMaxSelections != null;
  const comboPoolMin = product?.comboMinSelections ?? 1;
  const comboPoolMax = product?.comboMaxSelections ?? Infinity;
  const [poolQty, setPoolQty] = useState<Record<string, number>>({});
  const poolTotal = Object.values(poolQty).reduce((a, b) => a + b, 0);
  const comboInstances = esComboPool
    ? (product?.comboComponents ?? []).flatMap((c) =>
        Array.from({ length: poolQty[claveComponente(c)] ?? 0 }, (_, i) => ({ comp: c, n: i + 1 })),
      )
    : (product?.comboComponents ?? []).flatMap((c) =>
        Array.from({ length: c.quantity }, (_, i) => ({ comp: c, n: i + 1 })),
      );
  // Clave estable plato+tamaño+número: en pool, quitar un plato desplaza los índices del arreglo.
  const claveInstancia = (inst: { comp: ComboComponentInfo; n: number }) =>
    `${claveComponente(inst.comp)}#${inst.n}`;
  const [comboQty, setComboQty] = useState<Record<string, Record<string, number>>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuantity(1);
    setNote('');
    setJustAdded(false);
    const firstVariant = product?.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.isAvailable !== false) : undefined;
    setSelectedVariantId(firstVariant?.id ?? null);
    setSelectedQty({});
    setComboQty({});
    setPoolQty({});
    setCollapsedCategories(new Set());
  }, [product?.id]);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const suggestions = useMemo(() => {
    if (!product) return [];
    return pickSuggestions(allProducts, product.id, 3);
  }, [product?.id, allProducts]);

  if (!product) return null;

  const selectedVariant =
    product.pricingMode === 'VARIANTS' ? product.variants?.find((v) => v.id === selectedVariantId) : undefined;
  // Solo los grupos que se ofrecen en el tamaño elegido. Filtrar acá y no en cada uso hace que
  // todo lo de abajo (lo elegido, los obligatorios que faltan, el total) mire la misma lista:
  // un grupo que no aplica no puede exigirse ni cobrarse, y el servidor lo rechaza igual.
  const modifierCategories = (product.modifierCategories ?? []).filter((c) => aplicaAlTamano(c, selectedVariant?.id));
  const basePrice = selectedVariant ? Number(selectedVariant.priceBase) : Number(product.price);
  // Con las unidades gratis del grupo aplicadas (las más baratas a $0, igual que el servidor).
  const chosenModifiers: SelectedModifier[] = modifierCategories.flatMap((c) =>
    lineasConGratis(c, selectedQty, selectedVariant?.id).map((l) => ({
      modifierId: l.modifierId,
      name: l.name,
      priceBase: String(l.priceBase),
      quantity: l.quantity,
    })),
  );
  const modifiersTotal = chosenModifiers.reduce((acc, m) => acc + Number(m.priceBase) * m.quantity, 0);
  const comboExtraTotal = comboInstances.reduce((acc, inst) => {
    const qty = comboQty[claveInstancia(inst)] ?? {};
    return acc + inst.comp.modifierCategories.reduce(
      (a, cat) => a + totalGrupoConGratis(cat, qty, inst.comp.variantId ?? null),
      0,
    );
  }, 0);
  const unitPrice = basePrice + modifiersTotal + comboExtraTotal;
  const price = publicPriceLabel(unitPrice, restaurant);
  const lineTotal = publicPriceLabel(unitPrice * quantity, restaurant);

  function categoryTotal(category: NonNullable<Product['modifierCategories']>[number]): number {
    return category.modifiers.reduce((acc, m) => acc + (selectedQty[m.id] ?? 0), 0);
  }

  const needsVariant = product.pricingMode === 'VARIANTS' && !selectedVariant;
  const missingRequiredCategory = modifierCategories.some((c) => categoryTotal(c) < effectiveMin(c));
  const comboIncomplete =
    (esComboPool && (poolTotal < comboPoolMin || poolTotal > comboPoolMax)) ||
    comboInstances.some((inst) => {
      const qty = comboQty[claveInstancia(inst)] ?? {};
      return inst.comp.modifierCategories.some((cat) => {
        const total = cat.modifiers.reduce((a, m) => a + (qty[m.id] ?? 0), 0);
        return total < effectiveMin(cat);
      });
    });
  const canAdd = !needsVariant && !missingRequiredCategory && !comboIncomplete;

  function toggleCollapse(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  /** Categorías de una sola opción: click en la ya elegida la deselecciona (si es opcional). */
  function toggleSingle(category: NonNullable<Product['modifierCategories']>[number], modifierId: string) {
    setSelectedQty((prev) => {
      const next = { ...prev };
      const wasSelected = (prev[modifierId] ?? 0) > 0;
      for (const m of category.modifiers) delete next[m.id];
      if (wasSelected && !category.isRequired) return next;
      next[modifierId] = 1;
      return next;
    });
  }

  /** Categorías de varias opciones: stepper por modificador, respetando el límite total de la
   * categoría y el tope propio del modificador (si tiene uno). */
  function stepQty(category: NonNullable<Product['modifierCategories']>[number], modifierId: string, delta: number) {
    setSelectedQty((prev) => {
      const current = prev[modifierId] ?? 0;
      const modifierMax = category.modifiers.find((m) => m.id === modifierId)?.maxQuantity ?? Infinity;
      if (delta > 0 && (categoryTotal(category) >= effectiveMax(category) || current >= modifierMax)) return prev;
      const next = Math.max(0, current + delta);
      const updated = { ...prev };
      if (next === 0) delete updated[modifierId];
      else updated[modifierId] = next;
      return updated;
    });
  }

  function confirmAdd(e: MouseEvent<HTMLButtonElement>) {
    if (!product || !canAdd) return;
    onAdd(
      {
        product,
        quantity,
        variantId: selectedVariant?.id,
        variantName: selectedVariant?.name,
        selectedModifiers: chosenModifiers,
        comboSelections: comboInstances.length
          ? (comboInstances.map((inst) => ({
              componentProductId: inst.comp.componentProductId,
              variantId: inst.comp.variantId ?? null,
              modifierIds: Object.entries(comboQty[claveInstancia(inst)] ?? {}).flatMap(
                ([id, q]) => Array(q).fill(id) as string[],
              ),
            })) satisfies ComboSelection[])
          : undefined,
        comboExtraTotal: comboInstances.length ? comboExtraTotal : undefined,
        note: note.trim() || undefined,
      },
      e.currentTarget.getBoundingClientRect(),
    );
    setQuantity(1);
    setNote('');
    setJustAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <FamilyDrawerRoot open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <FamilyDrawerPortal>
        <FamilyDrawerOverlay onClick={onClose} />
        <FamilyDrawerContent>
          <FamilyDrawerAnimatedWrapper className="!px-0 !pt-0">
            <FamilyDrawerClose className="!bg-white/90 shadow-md !text-brand-950" />

            <div className="max-h-[75vh] overflow-y-auto">
              {product.photoUrl ? (
                <img
                  src={product.photoUrl}
                  alt={product.name}
                  onClick={() => onOpenGallery(product)}
                  className="h-52 w-full object-cover cursor-pointer"
                />
              ) : (
                <div className="h-52 w-full bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-6xl">
                  🍽️
                </div>
              )}

              <div className="px-6 pt-4 pb-6">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-brand-950">{product.name}</h2>
                  {(product.isStar || product.isPromo || product.isHouseSpecial || product.onTimePromo) && (
                    <div className="flex gap-1 shrink-0 pt-1">
                      {product.isStar && <Badge color="amber">Estrella</Badge>}
                      {product.isPromo && <Badge color="rose">Promo</Badge>}
                      {product.isHouseSpecial && <Badge color="indigo">Recomendado</Badge>}
                      {product.onTimePromo && <Badge color="emerald">⏰ Oferta</Badge>}
                    </div>
                  )}
                </div>

                {product.description && (
                  <p className="text-sm text-brand-950/60 font-light mt-2 leading-relaxed">{product.description}</p>
                )}

                {product.prepTimeMinutes != null && (
                  <p className="text-xs text-brand-950/50 font-light mt-1.5 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> ~{product.prepTimeMinutes} min
                  </p>
                )}

                {orderingEnabled && (
                  <>
                    {product.pricingMode === 'VARIANTS' && product.variants && product.variants.length > 0 && (
                      <div className="mt-5">
                        <p className="text-sm font-medium text-brand-950/70 mb-2">Elige una opción</p>
                        <div className="space-y-2">
                          {product.variants.map((v) => (
                            <label
                              key={v.id}
                              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                                selectedVariantId === v.id ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                              }`}
                            >
                              <span className="flex items-center gap-2 text-brand-950">
                                <input
                                  type="radio"
                                  name="variant"
                                  checked={selectedVariantId === v.id}
                                  onChange={() => setSelectedVariantId(v.id)}
                                />
                                {v.name}
                              </span>
                              <span className="text-brand-950/60 font-medium">
                                {formatBase(v.priceBase, restaurant.currencySymbol)}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {esComboPool && (
                      <div className="mt-4">
                        <ComboPoolSelector
                          componentes={product.comboComponents ?? []}
                          poolQty={poolQty}
                          min={comboPoolMin}
                          max={comboPoolMax}
                          onChange={setPoolQty}
                        />
                      </div>
                    )}

                    {comboInstances.map((inst) => {
                      const clave = claveInstancia(inst);
                      const repetidas = esComboPool
                        ? (poolQty[claveComponente(inst.comp)] ?? 0)
                        : inst.comp.quantity;
                      const nombre = inst.comp.variantName
                        ? `${inst.comp.name} ${inst.comp.variantName}`
                        : inst.comp.name;
                      return (
                        <div key={clave} className="mt-4">
                          <ComboInstancePicker
                            titulo={repetidas > 1 ? `${nombre} (${inst.n})` : nombre}
                            categorias={inst.comp.modifierCategories}
                            qty={comboQty[clave] ?? {}}
                            variantId={inst.comp.variantId ?? null}
                            currencySymbol={restaurant.currencySymbol ?? '$'}
                            onChange={(next) => setComboQty((prev) => ({ ...prev, [clave]: next }))}
                          />
                        </div>
                      );
                    })}

                    {/* Los modificadores del producto van al final: después de elegir tamaño/opción y,
                        si es un combo, después de elegir los componentes — no antes. */}
                    {modifierCategories.map((category) => {
                      const collapsed = collapsedCategories.has(category.id);
                      const total = categoryTotal(category);
                      const max = effectiveMax(category);
                      return (
                        <div key={category.id} className="mt-5 border-t border-brand-950/10 pt-4 first:border-t-0 first:pt-0">
                          <button
                            type="button"
                            onClick={() => toggleCollapse(category.id)}
                            className="w-full flex items-center justify-between gap-2 text-left"
                          >
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-brand-950">{category.name}</p>
                                <span
                                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                    category.isRequired ? 'bg-amber-100 text-amber-700' : 'bg-brand-950/5 text-brand-950/40'
                                  }`}
                                >
                                  {category.isRequired ? 'Obligatorio' : 'Opcional'}
                                </span>
                                {Number.isFinite(max) && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-400/10 text-brand-600">
                                    {total}/{max}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-brand-950/40 mt-0.5">
                                {categoryHint(category)}
                                {total > 0 && !Number.isFinite(max) && ` · ${total} elegido${total > 1 ? 's' : ''}`}
                              </p>
                            </div>
                            <span className="shrink-0 text-brand-950/40">
                              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                            </span>
                          </button>
                          {!collapsed && (
                            <div className="space-y-2 mt-2.5">
                              {category.modifiers.map((m) => {
                                const qty = selectedQty[m.id] ?? 0;
                                const checked = qty > 0;
                                const modPrice = effectiveModifierPrice(m, selectedVariant?.id);

                                if (category.allowMultiple) {
                                  return (
                                    <div
                                      key={m.id}
                                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                                        checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                                      }`}
                                    >
                                      <span className="text-brand-950 min-w-0 truncate">
                                        {m.name}
                                        {modPrice > 0 && (
                                          <span className="text-brand-950/60 font-medium">
                                            {' '}
                                            +{formatBase(modPrice, restaurant.currencySymbol)}
                                          </span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-2.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => stepQty(category, m.id, -1)}
                                          disabled={qty === 0}
                                          className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                                        >
                                          −
                                        </button>
                                        <span className="w-4 text-center text-sm font-medium">{qty}</span>
                                        <button
                                          type="button"
                                          onClick={() => stepQty(category, m.id, 1)}
                                          disabled={total >= max || qty >= (m.maxQuantity ?? Infinity)}
                                          className="w-7 h-7 rounded-full border border-brand-950/20 font-bold text-brand-950 text-xs disabled:opacity-30"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => toggleSingle(category, m.id)}
                                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm text-left ${
                                      checked ? 'border-brand-500 bg-brand-400/10' : 'border-brand-950/10'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 text-brand-950">
                                      <span
                                        className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                          checked ? 'border-brand-500' : 'border-brand-950/25'
                                        }`}
                                      >
                                        {checked && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                                      </span>
                                      {m.name}
                                    </span>
                                    {modPrice > 0 && (
                                      <span className="text-brand-950/60 font-medium">
                                        +{formatBase(modPrice, restaurant.currencySymbol)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="flex items-center justify-between mt-5">
                      <span className="text-sm font-medium text-brand-950/70">Cantidad</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] font-bold shadow-[0_8px_16px_-6px_rgba(5,108,242,0.5)] flex items-center justify-center disabled:opacity-40"
                          disabled={quantity <= 1}
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-semibold text-brand-950">{quantity}</span>
                        <button
                          onClick={() => setQuantity((q) => q + 1)}
                          className="w-8 h-8 rounded-full bg-brand-500 text-[color:var(--qt-button-text,white)] font-bold shadow-[0_8px_16px_-6px_rgba(5,108,242,0.5)] flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota de cocina (ej: sin cebolla)"
                      className="w-full mt-4 text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                    />

                    <div className="flex items-center gap-3 mt-5">
                      <div className="bg-brand-500 text-[color:var(--qt-button-text,white)] rounded-full px-4 py-3 text-sm font-semibold whitespace-nowrap">
                        {lineTotal.primary}
                      </div>
                      <button
                        onClick={confirmAdd}
                        disabled={justAdded || !canAdd}
                        className="flex-1 rounded-full bg-brand-500 text-white text-sm font-semibold tracking-wide py-3 flex items-center justify-center gap-1.5 shadow-[0_16px_32px_-8px_rgba(5,108,242,0.45)] transition-opacity disabled:opacity-50"
                      >
                        {justAdded ? (
                          <>
                            <Check className="h-4 w-4" /> AÑADIDO
                          </>
                        ) : (
                          'AÑADIR AL CARRITO'
                        )}
                      </button>
                    </div>
                    {price.secondary && (
                      <p className="text-xs text-brand-950/40 text-center mt-2">Equivalente: {price.secondary}</p>
                    )}
                  </>
                )}

                {suggestions.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-brand-950/10">
                    <p className="text-sm font-semibold text-brand-950 mb-3">También te puede interesar</p>
                    <div className="grid grid-cols-3 gap-2">
                      {suggestions.map((s) => (
                        <SuggestionCard key={s.id} product={s} restaurant={restaurant} onClick={() => onSelectProduct(s)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </FamilyDrawerAnimatedWrapper>
        </FamilyDrawerContent>
      </FamilyDrawerPortal>
    </FamilyDrawerRoot>
  );
}

function SuggestionCard({ product, restaurant, onClick }: { product: Product; restaurant: Restaurant; onClick: () => void }) {
  const displayPrice = productDisplayPriceBase(product);
  const price = publicPriceLabel(displayPrice.amountBase, restaurant);
  return (
    <button onClick={onClick} className="text-center">
      {product.photoUrl ? (
        <img
          src={product.photoUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-16 w-full rounded-xl object-cover mb-1"
        />
      ) : (
        <div className="h-16 w-full rounded-xl bg-gradient-to-br from-brand-400/20 to-brand-500/10 flex items-center justify-center text-xl mb-1">
          🍽️
        </div>
      )}
      <p className="text-xs font-medium text-brand-950 truncate">{product.name}</p>
      <p className="text-[11px] text-brand-950/50">
        {displayPrice.isFromVariant && 'Desde '}
        {price.primary}
      </p>
    </button>
  );
}

function Badge({ children, color }: { children: string; color: 'amber' | 'rose' | 'indigo' | 'emerald' }) {
  const map = {
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[color]}`}>{children}</span>;
}
