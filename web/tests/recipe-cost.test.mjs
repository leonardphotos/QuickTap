import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRecipe, isRecipeDraft, newRecipe } from '../src/utils/tools/recipe-cost.ts';
import { readToolDraft, DRAFT_TTL } from '../src/utils/tools/draft-storage.ts';
const sample = () => ({ ...newRecipe(), portions: '4', packaging: '0.25', other: '0.50', sale: '6', target: '30', monthly: '100', ingredients: [{ id: 'a', name: 'Pollo', price: '6', purchased: '1', purchaseUnit: 'kg', used: '600', usedUnit: 'g', waste: '20' }] });
function result(d = sample()) { const x = calculateRecipe(d); assert.equal(x.ok, true, JSON.stringify(x)); return x.result; }
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('merma, conversión kg/g, costos por porción y margen mensual', () => {
  const r = result(); close(r.ingredientCosts[0].usableQuantity, .8); close(r.ingredientCosts[0].usableUnitCost, 7.5); close(r.ingredientsTotal, 4.5); close(r.recipeTotal, 7.5); close(r.portionCost, 1.875); close(r.profit, 4.125); close(r.margin, 68.75); close(r.foodCost, 31.25); close(r.recommended, 6.25); close(r.monthlyProfit, 412.5); assert.equal(r.status, 'tight');
});
test('litros/ml, unidades y compras múltiples suman sin redondeo intermedio', () => {
  const d = sample(); d.ingredients = [{ ...d.ingredients[0], price: '3', purchased: '2', purchaseUnit: 'l', used: '500', usedUnit: 'ml', waste: '' }, { ...d.ingredients[0], id: 'b', name: 'Huevos', price: '6', purchased: '12', purchaseUnit: 'unit', used: '24', usedUnit: 'unit', waste: '0' }]; close(result(d).ingredientsTotal, 12.75);
});
test('precio cero conserva costos sin dividir entre cero', () => { const r = result({ ...sample(), sale: '0', monthly: '' }); assert.equal(r.foodCost, null); assert.equal(r.margin, null); assert.equal(r.monthlyProfit, null); assert.equal(r.status, 'risk'); close(r.profit, -1.875); });
test('pérdida, punto de equilibrio y límites del semáforo', () => {
  assert.equal(result({ ...sample(), sale: '1' }).status, 'risk');
  assert.equal(result({ ...sample(), sale: '1.875', target: '100' }).status, 'risk');
  assert.equal(result({ ...sample(), target: '31.25' }).status, 'healthy');
  assert.equal(result({ ...sample(), target: '26.25' }).status, 'tight');
  assert.equal(result({ ...sample(), target: '26.24' }).status, 'risk');
});
test('coma decimal y moneda no alteran la fórmula; cero ventas es cero', () => { const d = sample(); d.packaging = '0,25'; d.currency = 'VES'; d.rate = '36,5'; d.monthly = '0'; close(result(d).portionCost, 1.875); close(result(d).rate, 36.5); assert.equal(result(d).monthlyProfit, 0); });
test('rechaza valores vacíos, negativos, no finitos y porcentajes fuera de rango', () => {
  for (const [key, values] of Object.entries({ portions: ['', '0', '-1', '1.5'], sale: ['', '-2', 'Infinity', '1e99'], packaging: ['', '-1'], other: ['', '-1'], target: ['', '0', '101'], rate: ['0', '-1'], monthly: ['-1', '1.5'] })) for (const value of values) assert.equal(calculateRecipe({ ...sample(), [key]: value }).ok, false, `${key}: ${value}`);
  for (const [key, values] of Object.entries({ price: ['', '-1', 'NaN'], purchased: ['', '0', '-1'], used: ['', '0', '-1'], waste: ['-1', '100', '101'], name: [' ', ''] })) for (const value of values) { const d = sample(); d.ingredients[0][key] = value; assert.equal(calculateRecipe(d).ok, false, `${key}: ${value}`); }
});
test('impide mezclar masa y volumen y exige ingredientes', () => { const d = sample(); d.ingredients[0].usedUnit = 'ml'; assert.equal(calculateRecipe(d).ok, false); assert.equal(calculateRecipe({ ...sample(), ingredients: [] }).ok, false); });
test('conserva precisión al repartir costos entre muchas porciones', () => { const d = sample(); d.ingredients[0] = { ...d.ingredients[0], price: '1', used: '1000', waste: '0' }; d.portions = '3'; d.packaging = '0'; d.other = '0'; close(result(d).portionCost * 3, 1); });
test('borrador corrupto, expirado, versión ajena o forma incorrecta no se restaura', () => {
  const now = 2000000000; const pack = data => JSON.stringify({ version: 1, savedAt: now, data });
  assert.deepEqual(readToolDraft(pack(sample()), isRecipeDraft, now), sample());
  for (const raw of [null, '{', '{}', pack({ ingredients: null }), JSON.stringify({ version: 2, savedAt: now, data: sample() }), JSON.stringify({ version: 1, savedAt: now - DRAFT_TTL, data: sample() })]) assert.equal(readToolDraft(raw, isRecipeDraft, now), null);
  const d = sample(); d.ingredients[0].purchaseUnit = '__proto__'; assert.equal(readToolDraft(pack(d), isRecipeDraft, now), null);
});
