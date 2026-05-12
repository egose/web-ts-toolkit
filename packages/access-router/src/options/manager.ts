import get from 'lodash/get';
import set from 'lodash/set';
import assign from 'lodash/assign';

export const getNestedOption = <T extends object, K extends keyof T>(
  manager: OptionsManager<any, T>,
  key: K | string,
  defaultValue?: T[K],
) => {
  const keys = String(key).split('.');
  if (keys.length === 1) {
    return manager.get(key, defaultValue);
  }

  let option = manager.get(key, undefined);
  if (option !== undefined) {
    return option;
  }

  const parentKey = keys.slice(0, -1).join('.');
  option = manager.get(`${parentKey}.default`, undefined);

  if (option === undefined) {
    option = manager.get(parentKey, defaultValue);
  }

  return option;
};

export class OptionsManager<T1 extends object, T2 extends object> {
  private readonly defaultOptions: T1;
  private currentOptions: T1;
  private listeners: { [key in keyof T1]?: Function };

  constructor(defaultOptions: T1) {
    this.defaultOptions = defaultOptions;
    this.listeners = {};
    const _this = this;

    this.currentOptions = new Proxy({} as T1, {
      set(target, key, value) {
        const keystr = String(key);
        const oldvalue = target[key];
        target[key] = value;
        _this.listeners[keystr] && _this.listeners[keystr].call(_this, value, keystr, target, oldvalue);
        return true;
      },
    });
  }

  build() {
    this.assign(this.defaultOptions);
    return this;
  }

  get<K extends keyof T2>(key: K | string, defaultValue?: T2[K]) {
    return get(this.currentOptions, key, defaultValue);
  }

  set<K extends keyof T2>(key: K | string, value: T2[K]) {
    set(this.currentOptions, key, value);
  }

  fetch() {
    return { ...this.currentOptions };
  }

  assign(options: T1) {
    assign(this.currentOptions, options);
  }

  onchange<K extends keyof T1>(key: K | string, func: Function) {
    set(this.listeners, key, func);
    return this;
  }
}
