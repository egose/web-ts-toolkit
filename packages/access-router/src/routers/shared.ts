export {
  formatCreatedData,
  formatListResponse,
  formatUpsertCreatedData,
} from '../http/response-pipelines/list-response';

export const parseBooleanString = (str: string | undefined, defaultValue?: boolean) =>
  str ? str === 'true' : defaultValue;

export const getStringRouteParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';
