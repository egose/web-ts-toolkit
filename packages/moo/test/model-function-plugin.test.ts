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

type CartDocument = ModelDocument<Cart, CartMethods>;

type CartMethods = ModelFunctionInstanceMethods<'applyDiscount', [string, number], CartDocument> &
  ModelFunctionInstanceMethods<'applyDiscountAsync', [string, number], Promise<CartDocument>>;

type CartModel = Model<Cart, {}, CartMethods> &
  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [string, number], CartDocument> &
  ModelFunctionStaticMethods<'applyDiscountAsync', CartDocument, [string, number], Promise<CartDocument>>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cartSchema = new mongoose.Schema<Cart, CartModel, CartMethods>({
  name: { type: String, required: true },
  price: { type: Number, required: true },
});

cartSchema.plugin(modelFunctionPlugin<Cart, CartMethods>, {
  fnName: 'applyDiscount',
  fn: (cart: CartDocument, nameSuffix: string, priceChange: number) => {
    cart.name = `${cart.name}_${nameSuffix}`;
    cart.price += priceChange;
    return cart;
  },
});

cartSchema.plugin(modelFunctionPlugin<Cart, CartMethods>, {
  fnName: 'applyDiscountAsync',
  fn: async (cart: CartDocument, nameSuffix: string, priceChange: number) => {
    await sleep(1);
    cart.name = `${cart.name}_${nameSuffix}`;
    cart.price += priceChange;
    return cart;
  },
});

const Cart = mongoose.model<Cart, CartModel>('ModelFunctionPluginCart', cartSchema);

describe('modelFunctionPlugin', () => {
  it('passes the document as the first argument for static and instance methods', async () => {
    const cart = await Cart.create({
      name: 'laptop',
      price: 2000,
    });

    const staticResult = Cart.applyDiscount(cart, 'premium', 100);
    const persistedCart = await Cart.findById(cart._id).orFail();
    const instanceResult = persistedCart.applyDiscount('premium', 100);

    expect(staticResult.name).toBe('laptop_premium');
    expect(staticResult.price).toBe(2100);
    expect(instanceResult.name).toBe('laptop_premium');
    expect(instanceResult.price).toBe(2100);
  });

  it('supports async functions', async () => {
    const cart = await Cart.create({
      name: 'mouse',
      price: 100,
    });

    const staticResult = await Cart.applyDiscountAsync(cart, 'pink', 1);
    const persistedCart = await Cart.findById(cart._id).orFail();
    const instanceResult = await persistedCart.applyDiscountAsync('pink', 1);

    expect(staticResult.name).toBe('mouse_pink');
    expect(staticResult.price).toBe(101);
    expect(instanceResult.name).toBe('mouse_pink');
    expect(instanceResult.price).toBe(101);
  });

  it('adds a by-id static helper', async () => {
    const cart = await Cart.create({
      name: 'keyboard',
      price: 500,
    });

    const result = await Cart.applyDiscountById(cart._id, 'mechanical', 20);

    expect(result?.name).toBe('keyboard_mechanical');
    expect(result?.price).toBe(520);
  });
});
