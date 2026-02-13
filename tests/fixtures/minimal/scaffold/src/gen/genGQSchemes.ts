/* Scaffold: generate GraphQL types via @graphql-codegen — based on rlw-back/src/gen/genGQSchemes.ts */
import {codegen} from '@graphql-codegen/core';
import type {Types} from '@graphql-codegen/plugin-helpers';
import * as typescriptPlugin from '@graphql-codegen/typescript';
import * as typescriptResolversPlugin from '@graphql-codegen/typescript-resolvers';
import path from 'path';
import {printSchema, parse} from 'graphql';
import fs from 'fs';
import getSchema from '../graph/schema.js';

const genGQSchemes = async () => {
  const schema = await getSchema();
  const schemaAst = parse(printSchema(schema));

  const output = await codegen({
    filename: 'graphql.ts',
    pluginMap: {
      typescript: typescriptPlugin,
      typescriptResolvers: typescriptResolversPlugin,
    },
    plugins: [
      {typescript: {}},
      {typescriptResolvers: {}},
    ] as Types.ConfiguredPlugin[],
    schema: schemaAst,
    config: [],
    documents: [],
  });

  const outPath = path.join(__dirname, '..', 'generated', 'graphql.ts');
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, output);
};

genGQSchemes();
