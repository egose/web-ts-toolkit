import type { RxCollection, RxDocument } from './rx-types';
import type { CompiledQuery } from './query-compiler';

export interface RxLikeDoc {
  _id: string;
  [k: string]: any;
}

export interface RxLikeCollection {
  find(compiled: CompiledQuery): Promise<RxLikeDoc[]>;
  findOne(compiled: CompiledQuery): Promise<RxLikeDoc | null>;
  insert(doc: any): Promise<RxLikeDoc>;
  modify(id: string, next: any): Promise<void>;
  incrementalModify(id: string, fn: (doc: any) => any): Promise<void>;
  remove(id: string): Promise<void>;
}

export class RxCollectionAdapter implements RxLikeCollection {
  constructor(private rxCollection: RxCollection<any> | any) {}

  private native(): RxCollection<any> {
    return this.rxCollection as RxCollection<any>;
  }

  async find(compiled: CompiledQuery): Promise<RxLikeDoc[]> {
    const query = this.native().find({
      selector: compiled.selector,
    });
    if (compiled.sort)
      for (const [k, v] of Object.entries(compiled.sort)) query.sort(k === '_id' ? '_id' : k, v === 1 ? 'asc' : 'desc');
    if (compiled.limit !== undefined) query.limit(compiled.limit);
    let docs: RxDocument[] = await query.exec();
    if (compiled.skip !== undefined && compiled.skip > 0) docs = docs.slice(compiled.skip);
    return docs.map((d) => d.toJSON(true));
  }

  async findOne(compiled: CompiledQuery): Promise<RxLikeDoc | null> {
    const query = this.native().findOne({ selector: compiled.selector });
    if (compiled.sort) for (const [k, v] of Object.entries(compiled.sort)) query.sort(k, v === 1 ? 'asc' : 'desc');
    const doc: RxDocument | null = await query.exec();
    return doc ? doc.toJSON(true) : null;
  }

  async insert(doc: any): Promise<RxLikeDoc> {
    const result = await this.native().insert(doc);
    return result.toJSON(true);
  }

  async modify(id: string, next: any): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.incrementalPatch(next);
  }

  async incrementalModify(id: string, fn: (doc: any) => any): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.incrementalModify((d: any) => fn(d));
  }

  async remove(id: string): Promise<void> {
    const doc = await this.native()
      .findOne({ selector: { _id: { $eq: id } } })
      .exec();
    if (!doc) throw new Error(`Document ${id} not found`);
    await doc.remove();
  }
}

export async function createCollectionLike(rxCollection: any): Promise<RxLikeCollection> {
  return new RxCollectionAdapter(rxCollection);
}

export default RxCollectionAdapter;
