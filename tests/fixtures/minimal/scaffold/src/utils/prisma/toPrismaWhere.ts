/* Copied from rlw-back */
import * as R from 'ramda';

type FilterValue = string | Date | number | boolean | null | FilterValue[] | Record<string, any>;
type FilterObject = Record<string, FilterValue>;

export const toPrismaWhere = (filter?: FilterObject | null) => {
  let result: Record<string, any> = {};

  if (!filter) {
    return result;
  }

  const postfixesForAnd = [
    '_lte',
    '_gte',
    '_lt',
    '_gt',
    '_not_in',
    '_in',
    '_defined',
  ];

  const initialPairs = R.toPairs(filter);

  const flatPairs = initialPairs
    .filter(
      ([key, _]: R.KeyValuePair<string, any>) => !['ids', 'q'].includes(key) && !postfixesForAnd.some(pf => key.includes(pf)),
    );

  const flatWhere = R.fromPairs(flatPairs);

  result = {
    ...result,
    ...flatWhere,
  };

  if (Object.keys(filter).includes('q') && (filter as any).q.trim()) {
    const searcQuery = (filter as any).q.trim().toLowerCase() as string;
    const searchKeys = searcQuery.split(' ').map(k => k.trim()).filter(Boolean);
    result = {
      ...result,
      AND: searchKeys.map(searchKey => ({
        search: {
          contains: searchKey,
        },
      })),
    };
  }

  const pairsForAnd = initialPairs.filter(
    ([key, _]: R.KeyValuePair<string, any>) => postfixesForAnd.some(pf => key.includes(pf)),
  );

  if (pairsForAnd.length > 0) {
    const filtersForAnd = pairsForAnd
      .map(([key, value]) => {
        if (key.includes('_lte')) {
          if (value === null || value === undefined) {
            return [];
          }
          return [key.replaceAll(/(_lte)$/gu, ''), {lte: value}];
        } else if (key.includes('_gte')) {
          if (value === null || value === undefined) {
            return [];
          }
          return [key.replaceAll(/(_gte)$/gu, ''), {gte: value}];
        } else if (key.includes('_lt')) {
          if (value === null || value === undefined) {
            return [];
          }
          return [key.replaceAll(/(_lt)$/gu, ''), {lt: value}];
        } else if (key.includes('_gt')) {
          if (value === null || value === undefined) {
            return [];
          }
          return [key.replaceAll(/(_gt)$/gu, ''), {gt: value}];
        } else if (key.includes('_not_in')) {
          const clearedKey = key.replaceAll(/(_not_in)$/gu, '');
          if (!Array.isArray(value) || value.length === 0) {
            return [];
          }
          const values = value as unknown as any[];
          const hasNullValue = values.includes(null);

          if (hasNullValue) {
            const valuesWithoutNull = values.filter(el => el !== null);
            return ['OR', [{[clearedKey]: {notIn: valuesWithoutNull}}, {[clearedKey]: null}]];
          } else {
            return [clearedKey, {notIn: value}];
          }
        } else if (key.includes('_in')) {
          const clearedKey = key.replaceAll(/(_in)$/gu, '');
          if (!Array.isArray(value) || value.length === 0) {
            return [];
          }
          const values = value as unknown as any[];
          const hasNullValue = values.includes(null);

          if (hasNullValue) {
            const valuesWithoutNull = values.filter(el => el !== null);
            return ['OR', [{[clearedKey]: {in: valuesWithoutNull}}, {[clearedKey]: null}]];
          } else {
            return [clearedKey, {in: value}];
          }
        } else if (key.includes('_defined')) {
          const clearedKey = key.replaceAll(/(_defined)$/gu, '');

          return value ? [clearedKey, {not: null}] : [clearedKey, null];
        }

        throw new Error(`Unknown AND filter, key: "${key}"`);
      })
      .map(([key, value]) => R.fromPairs([[key, value]] as R.KeyValuePair<string, string>[]));

    result = {
      ...result,
      AND: [
        ...(result as any).AND ?? [],
        ...filtersForAnd,
      ],
    };
  }

  return result;
};
