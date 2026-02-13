/* Scaffold: GraphQL typeDefs loader — loads all *TypeDefs.ts from graph services */
import {mergeTypeDefs} from '@graphql-tools/merge';
import {loadFiles} from '@graphql-tools/load-files';
import path from 'path';

const getTypeDefs = () => Promise.all([
  loadFiles(path.join(__dirname, '../*/graph/services/*/*TypeDefs.?(ts)?(js)')),
  loadFiles(path.join(__dirname, '../*/graph/services/*/*typeDefs.?(ts)?(js)')),
])
  .then(files => files.flat().filter(s => s.kind && s.kind === 'Document'))
  .then((files) => mergeTypeDefs([...files]))

export default getTypeDefs;
