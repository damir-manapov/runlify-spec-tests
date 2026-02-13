/* Scaffold: GraphQL resolvers loader — loads all *Resolvers.ts from graph services */
import {mergeResolvers} from '@graphql-tools/merge';
import {loadFilesSync} from '@graphql-tools/load-files';
import {GraphQLScalarType, Kind} from 'graphql';
import path from 'path';

/** Custom BigInt scalar — serializes/parses bigint as string */
export const BigIntScalar = new GraphQLScalarType({
  name: 'BigInt',
  description: 'The `BigInt` scalar type represents non-fractional signed whole numeric values.',
  serialize(value: unknown): string {
    return String(value);
  },
  parseValue(value: unknown): bigint {
    return BigInt(value as string | number);
  },
  parseLiteral(ast): bigint | null {
    if (ast.kind === Kind.INT || ast.kind === Kind.STRING) {
      return BigInt(ast.value);
    }
    return null;
  },
});

const resolversArray = [
  ...loadFilesSync(path.join(__dirname, '../*/graph/services/*/*Resolvers.?(ts)?(js)')),
  ...loadFilesSync(path.join(__dirname, '../*/graph/services/*/resolvers.?(ts)?(js)')),
];

const mergedResolvers = mergeResolvers([...resolversArray]);

export default mergedResolvers;
