import { type AxiosRequestConfig, mergeConfig } from 'axios';

// Generated service params take precedence, including undefined values that
// omit an option from the wire. Axios only deep-merges plain-object params.
export function mergeServiceParams(
  config: AxiosRequestConfig,
  generated: Record<string, string | number | boolean | null | undefined>,
): AxiosRequestConfig {
  if (typeof URLSearchParams !== 'undefined' && config.params instanceof URLSearchParams) {
    const params = new URLSearchParams(config.params);
    for (const [key, value] of Object.entries(generated)) {
      if (value == null) params.delete(key);
      else params.set(key, String(value));
    }
    return mergeConfig(config, { params });
  }
  return mergeConfig(config, { params: generated });
}
