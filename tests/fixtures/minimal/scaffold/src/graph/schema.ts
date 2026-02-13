/* Scaffold: GraphQL schema — merges typeDefs + resolvers */
import {mergeSchemas} from '@graphql-tools/schema';
import resolvers from './resolvers';
import getTypeDefs from './typeDefs';
import {GraphQLSchema} from 'graphql';

const getSchema = async (): Promise<GraphQLSchema> => {
  const typeDefs = await getTypeDefs();

  const schema: GraphQLSchema = mergeSchemas({
    resolvers,
    schemas: [],
    typeDefs,
  });

  return schema;
}

export default getSchema;
