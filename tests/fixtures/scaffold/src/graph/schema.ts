/* Scaffold: GraphQL schema — merges typeDefs + resolvers */
import {mergeSchemas} from '@graphql-tools/schema';
import resolvers, {BigIntScalar} from './resolvers';
import getTypeDefs from './typeDefs';
import {GraphQLSchema, print} from 'graphql';

const getSchema = async (): Promise<GraphQLSchema> => {
  const typeDefs = await getTypeDefs();

  // Conditionally add BigInt scalar resolver only if typeDefs declare it
  const typeDefsText = Array.isArray(typeDefs)
    ? typeDefs.map(td => (typeof td === 'string' ? td : print(td))).join('\n')
    : typeof typeDefs === 'string' ? typeDefs : print(typeDefs);
  const hasBigInt = typeDefsText.includes('scalar BigInt');

  const mergedResolvers = hasBigInt
    ? {...resolvers, BigInt: BigIntScalar}
    : resolvers;

  const schema: GraphQLSchema = mergeSchemas({
    resolvers: mergedResolvers,
    schemas: [],
    typeDefs,
  });

  return schema;
}

export default getSchema;
