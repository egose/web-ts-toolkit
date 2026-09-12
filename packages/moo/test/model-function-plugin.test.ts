import mongoose, { type Model } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  type ModelDocument,
  type ModelFunctionInstanceMethods,
  type ModelFunctionStaticMethods,
  modelFunctionPlugin,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type Cart = {
  name: string;
  price: number;
};

// Note: result types stay free of the CartDocument alias (plain number results
// instead of returning the document) so CartDocument/CartMethods do not
// circularly reference each other (TS2456). The plugin still exposes typed
// sync/async instance, static, and ById surfaces with full inference.
type CartMethods = ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], number> &
  ModelFunctionInstanceMethods<'applyDiscountAsync', [suffix: string, priceChange: number], Promise<number>>;

type CartDocument = ModelDocument<Cart, CartMethods>;

type CartModel = Model<Cart, Record<string, never>, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], number> &
  ModelFunctionStaticMethods<
    'applyDiscountAsync',
    CartDocument,
    [suffix: string, priceChange: number],
    Promise<number>
  >;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cartSchema = new mongoose.Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, nameSuffix: string, priceChange: number) => {
    cart.name = `${cart.name}_${nameSuffix}`;
    cart.price += priceChange;
    return cart.price;
  },
});

cartSchema.plugin(modelFunctionPlugin, {
  fnName: 'applyDiscountAsync',
  fn: async (cart: CartDocument, nameSuffix: string, priceChange: number) => {
    await sleep(1);
    cart.name = `${cart.name}_${nameSuffix}`;
    cart.price += priceChange;
    return cart.price;
  },
});

const Cart = mongoose.model<Cart, CartModel>('ModelFunctionPluginCart', cartSchema);

describe('modelFunctionPlugin', () => {
  it('passes the document as the first argument for static and instance methods', async () => {
    const cart = await Cart.create({
      name: 'laptop',
      price: 2000,
    });

    const staticPrice: number = Cart.applyDiscount(cart, 'premium', 100);
    const persistedCart = await Cart.findById(cart._id).orFail();
    const instancePrice: number = persistedCart.applyDiscount('premium', 100);

    expect(staticPrice).toBe(2100);
    expect(cart.name).toBe('laptop_premium');
    expect(cart.price).toBe(2100);
    expect(instancePrice).toBe(2100);
    expect(persistedCart.name).toBe('laptop_premium');
    expect(persistedCart.price).toBe(2100);
  });

  it('supports async functions', async () => {
    const cart = await Cart.create({
      name: 'mouse',
      price: 100,
    });

    const staticPrice: number = await Cart.applyDiscountAsync(cart, 'pink', 1);
    const persistedCart = await Cart.findById(cart._id).orFail();
    const instancePrice: number = await persistedCart.applyDiscountAsync('pink', 1);

    expect(staticPrice).toBe(101);
    expect(cart.name).toBe('mouse_pink');
    expect(cart.price).toBe(101);
    expect(instancePrice).toBe(101);
    expect(persistedCart.name).toBe('mouse_pink');
    expect(persistedCart.price).toBe(101);
  });

  it('adds a by-id static helper', async () => {
    const cart = await Cart.create({
      name: 'keyboard',
      price: 500,
    });

    const result: number | null = await Cart.applyDiscountById(cart._id, 'mechanical', 20);

    expect(result).toBe(520);
    const missing = await Cart.applyDiscountById(new mongoose.Types.ObjectId().toString(), 'ghost', 1);
    expect(missing).toBeNull();
  });
});
