import type { AxiosRequestConfig } from 'axios';
import type { AdditionalReqConfig } from '../interface';

// Only recognize declared transport keys. An unknown-key options bag must
// retain its original slot so correlated capture still bounds/clones it.
const REQUEST_CONFIG_KEYS = [
  'url',
  'method',
  'baseURL',
  'allowAbsoluteUrls',
  'transformRequest',
  'transformResponse',
  'headers',
  'params',
  'paramsSerializer',
  'data',
  'timeout',
  'timeoutErrorMessage',
  'withCredentials',
  'adapter',
  'auth',
  'responseType',
  'responseEncoding',
  'xsrfCookieName',
  'xsrfHeaderName',
  'onUploadProgress',
  'onDownloadProgress',
  'maxContentLength',
  'validateStatus',
  'maxBodyLength',
  'maxRedirects',
  'maxRate',
  'beforeRedirect',
  'socketPath',
  'allowedSocketPaths',
  'transport',
  'httpAgent',
  'httpsAgent',
  'proxy',
  'cancelToken',
  'decompress',
  'transitional',
  'signal',
  'insecureHTTPParser',
  'env',
  'formSerializer',
  'family',
  'lookup',
  'withXSRFToken',
  'parseReviver',
  'fetchOptions',
  'httpVersion',
  'http2Options',
  'formDataHeaderPolicy',
  'redact',
  'sensitiveHeaders',
  'throwOnError',
] as const satisfies readonly (keyof (AxiosRequestConfig & AdditionalReqConfig))[];

export interface OptionalArgsSpec<TArgs extends object, TOptions extends object> {
  method: string;
  argumentKeys: readonly (keyof TArgs)[];
  optionKeys: readonly (keyof TOptions)[];
  /** Interpretation of empty objects when neither position identifies a role. */
  emptyForm: 'args' | 'options';
}

const hasKey = (value: unknown, key: PropertyKey): boolean =>
  typeof value === 'object' && value !== null && key in value;

/**
 * Resolve `(args?, options?, config?)` and `(options?, config?)` without
 * modifying caller inputs. Key presence (even with undefined/false/0 values)
 * identifies args/options; an explicitly supplied third trailing position
 * identifies the full form. Empty-object ambiguity retains the method's
 * original arrangement. Defaults are applied by the service afterward.
 */
export function splitOptionalArgs<TArgs extends object, TOptions extends object, TConfig extends object>(
  spec: OptionalArgsSpec<TArgs, TOptions>,
  first: TArgs | TOptions | undefined,
  second: TOptions | TConfig | undefined,
  third: TConfig | undefined,
  argumentCount: number,
): { args?: TArgs; options?: TOptions; config?: TConfig } {
  const hasArgs = spec.argumentKeys.some((key) => hasKey(first, key));
  const optionKey = spec.optionKeys.find((key) => hasKey(first, key));

  if (hasArgs || argumentCount >= 3) {
    if (optionKey !== undefined) {
      throw new TypeError(
        `${spec.method}(...): '${String(optionKey)}' belongs in options; pass args and options as separate arguments`,
      );
    }
    return { args: first as TArgs | undefined, options: second as TOptions | undefined, config: third };
  }

  if (optionKey !== undefined) {
    return { options: first as TOptions, config: second as TConfig | undefined };
  }

  if (spec.optionKeys.some((key) => hasKey(second, key))) {
    return { args: first as TArgs | undefined, options: second as TOptions, config: third };
  }

  // Known transport keys identify config; empty/unknown-key objects keep
  // list's args form/read's legacy options form. Never classify an options
  // bag as config just because it contains a non-option extension key.
  const hasConfig = REQUEST_CONFIG_KEYS.some((key) => hasKey(second, key));
  if (hasConfig || spec.emptyForm === 'options') {
    return { options: first as TOptions | undefined, config: second as TConfig | undefined };
  }

  return { args: first as TArgs | undefined, options: second as TOptions | undefined, config: third };
}
