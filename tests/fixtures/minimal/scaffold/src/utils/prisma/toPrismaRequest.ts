/* Copied from rlw-back */
import {toPrismaWhere} from './toPrismaWhere';
import {AllRequestArgs, IOptions} from '../types';

export const toPrismaRequest = ({filter, page, perPage, sortField, sortOrder}: AllRequestArgs, options?: IOptions) => {
  const orderBy = sortField && (
    !options || !options.noId || options.noId &&
    sortField !== 'id'
  ) ?
    {[sortField]: (
      (sortOrder && sortOrder.toUpperCase() === 'ASC') ?
        'asc' :
        'desc'
    )} :
    undefined;

  return {
    orderBy,
    skip: (page || 0) * (perPage || 0),
    take: perPage || undefined,
    where: toPrismaWhere(filter),
  };
};
