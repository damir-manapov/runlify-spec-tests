/* Copied from rlw-back: ServiceUtils */
import dayjs from 'dayjs';
import * as R from 'ramda';

export type ServiceUtils = {
  dayjs: typeof dayjs;
  R: typeof R;
}
export const serviceUtils: ServiceUtils = {
  dayjs,
  R,
};
