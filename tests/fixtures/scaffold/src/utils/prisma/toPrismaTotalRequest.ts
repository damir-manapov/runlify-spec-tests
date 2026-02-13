/* Copied from rlw-back */
import {AllRequestArgs, IOptions} from '../types';
import {toPrismaWhere} from './toPrismaWhere';

export const toPrismaTotalRequest = ({filter, sortField, sortOrder}: AllRequestArgs, options?: IOptions) => {
  const orderBy = sortField && (!options || !options.noId || options.noId && sortField !== 'id') ?
    {[sortField]: (
      (sortOrder && sortOrder === 'ASC') ?
        'asc' :
        'desc'
    )} :
    undefined;

  return {
    orderBy,
    where: toPrismaWhere(filter),
  };
};
