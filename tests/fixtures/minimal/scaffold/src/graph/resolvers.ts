/* Scaffold: GraphQL resolvers loader — loads all *Resolvers.ts from graph services */
import {mergeResolvers} from '@graphql-tools/merge';
import {loadFilesSync} from '@graphql-tools/load-files';
import path from 'path';

const resolversArray = [
  ...loadFilesSync(path.join(__dirname, '../*/graph/services/*/*Resolvers.?(ts)?(js)')),
  ...loadFilesSync(path.join(__dirname, '../*/graph/services/*/resolvers.?(ts)?(js)')),
];

const mergedResolvers = mergeResolvers([...resolversArray]);

export default mergedResolvers;
