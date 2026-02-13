/* Copied from rlw-back: HooksUtils — hook pipeline for services */
import {PrismaPromise} from '@prisma/client';
import {Context} from './types';

export type HooksUtilsType<
  Entity extends {},
  QueryAllArgs extends {},
  ReliableCreateUserInput extends {},
  MutationUpdateArgs extends {},
  MutationRemoveArgs extends {},
  StrictCreateArgs extends {} = ReliableCreateUserInput,
  StrictUpdateArgs extends {} = MutationUpdateArgs,
> = {
  changeListFilter: (ctx: Context, args: QueryAllArgs) => Promise<QueryAllArgs>;
  beforeCreate: (ctx: Context, data: ReliableCreateUserInput) => Promise<StrictCreateArgs>;
  beforeCreateStrict: (ctx: Context, data: StrictCreateArgs) => Promise<StrictCreateArgs>;
  afterCreate: (ctx: Context, data: Entity) => Promise<void>;
  beforeUpdate: (ctx: Context, data: StrictUpdateArgs) => Promise<StrictUpdateArgs>;
  afterUpdate: (ctx: Context, data: Entity) => Promise<void>,
  beforeDelete: (ctx: Context, params: MutationRemoveArgs) => Promise<void>;
  afterDelete: (ctx: Context, data: Entity) => Promise<void>;
  beforeUpsert: (ctx: Context, data: {
    createData: ReliableCreateUserInput;
    updateData: StrictUpdateArgs;
  }) => Promise<{
    createData: StrictCreateArgs;
    updateData: StrictUpdateArgs;
  }>;
  beforeUpsertStrict: (ctx: Context, data: {
    createData: StrictCreateArgs;
    updateData: StrictUpdateArgs;
  }) => Promise<{
    createData: StrictCreateArgs;
    updateData: StrictUpdateArgs;
  }>;
  additionalOperationsOnCreate: (ctx: Context, data: ReliableCreateUserInput) => Promise<PrismaPromise<any>[]>;
  additionalOperationsOnUpdate: (ctx: Context, data: MutationUpdateArgs) => Promise<PrismaPromise<any>[]>;
  additionalOperationsOnDelete: (ctx: Context, data: MutationRemoveArgs) => Promise<PrismaPromise<any>[]>;
};

export type HooksAddType<
  Entity extends {},
  QueryAllArgs extends {},
  ReliableCreateUserInput extends {},
  MutationUpdateArgs extends {},
  MutationRemoveArgs extends {},
  StrictCreateArgs extends {} = ReliableCreateUserInput,
  StrictUpdateArgs extends {} = MutationUpdateArgs,
  T = HooksUtilsType<
    Entity,
    QueryAllArgs,
    ReliableCreateUserInput,
    MutationUpdateArgs,
    MutationRemoveArgs,
    StrictCreateArgs,
    StrictUpdateArgs
  >,
> = {hooksAdd: {[K in keyof T]: (func: T[K]) => any}};

type ObjValToArr<T> = {
  [K in keyof T]: T[K][];
}

export const getHooksUtils = <
  Entity extends {},
  QueryAllArgs extends {},
  ReliableCreateUserInput extends {},
  MutationUpdateArgs extends {},
  MutationRemoveArgs extends {},
  StrictCreateArgs extends {} = ReliableCreateUserInput,
  StrictUpdateArgs extends {} = MutationUpdateArgs,
>() => {
  type ServiceHooksType = HooksUtilsType<
    Entity,
    QueryAllArgs,
    ReliableCreateUserInput,
    MutationUpdateArgs,
    MutationRemoveArgs,
    StrictCreateArgs,
    StrictUpdateArgs
  >;
  const hooks: ObjValToArr<ServiceHooksType> = {
    changeListFilter: [],
    beforeCreate: [],
    beforeCreateStrict: [],
    afterCreate: [],
    beforeUpdate: [],
    afterUpdate: [],
    beforeDelete: [],
    afterDelete: [],
    beforeUpsert: [],
    beforeUpsertStrict: [],
    additionalOperationsOnCreate: [],
    additionalOperationsOnUpdate: [],
    additionalOperationsOnDelete: [],
  } as unknown as ObjValToArr<ServiceHooksType>;

  type KeysWithReturnedSecondAttr =
    | 'beforeCreate'
    | 'beforeCreateStrict'
    | 'beforeUpdate'
    | 'beforeUpsert'
    | 'beforeUpsertStrict'
    | 'changeListFilter';

  const runWithReturnSecondAttr = <T extends KeysWithReturnedSecondAttr>(key: T): ServiceHooksType[T] =>
    async (ctx: Context, data: any) => {
      let processedData = data;
      for (const hook of hooks[key]) {
        processedData = await hook(ctx, processedData);
      }

      return processedData;
    };

  const runWithReturnSecondAttrWithStrict = <T extends 'beforeCreate' | 'beforeUpsert'>(key: T): ServiceHooksType[T] =>
    async (ctx: Context, data: any) => {
      let processedData = data;
      for (const hook of hooks[key]) {
        processedData = await hook(ctx, processedData);
      }

      for (const hook of hooks[`${key}Strict`]) {
        processedData = await hook(ctx, processedData);
      }

      return processedData;
    };

  type KeysWithReturnedTypeVoid = 'afterCreate' | 'afterUpdate' | 'afterDelete' | 'beforeDelete';

  const runWithReturnVoid = <T extends KeysWithReturnedTypeVoid>(key: T): ServiceHooksType[T] =>
    async (ctx: Context, attr: any): Promise<void> => {
      for (const hook of hooks[key]) {
        await hook(ctx, attr);
      }
    };

  const runImmediatelyAllWithReturnVoid = <T extends KeysWithReturnedTypeVoid>(key: T): ServiceHooksType[T] =>
    async (ctx: Context, attr: any) => {
      await Promise.all(hooks[key].map((hook) => hook(ctx, attr)));
    };

  type KeysWithReturnedTypeVoidArr = 'additionalOperationsOnCreate' | 'additionalOperationsOnUpdate' | 'additionalOperationsOnDelete';
  const runImmediatelyAllWithReturnVoidArr = <T extends KeysWithReturnedTypeVoidArr>(key: T): ServiceHooksType[T] =>
    async (ctx: Context, attr: any): Promise<PrismaPromise<any>[]> => {
      const callHookPromises: PrismaPromise<any>[][] = await Promise.all(hooks[key].map((hook) => hook(ctx, attr)));

      return callHookPromises.flat();
    };

  const runHooks: Omit<ServiceHooksType, 'beforeCreateStrict' | 'beforeUpsertStrict'> = {
    changeListFilter: runWithReturnSecondAttr('changeListFilter'),
    beforeCreate: runWithReturnSecondAttrWithStrict('beforeCreate'),
    beforeUpsert: runWithReturnSecondAttrWithStrict('beforeUpsert'),
    beforeUpdate: runWithReturnSecondAttr('beforeUpdate'),
    afterCreate: runImmediatelyAllWithReturnVoid('afterCreate'),
    afterUpdate: runImmediatelyAllWithReturnVoid('afterUpdate'),
    afterDelete: runWithReturnVoid('afterDelete'),
    beforeDelete: runWithReturnVoid('beforeDelete'),
    additionalOperationsOnCreate: runImmediatelyAllWithReturnVoidArr('additionalOperationsOnCreate'),
    additionalOperationsOnUpdate: runImmediatelyAllWithReturnVoidArr('additionalOperationsOnUpdate'),
    additionalOperationsOnDelete: runImmediatelyAllWithReturnVoidArr('additionalOperationsOnDelete'),
  };

  const hooksAdd: HooksAddType<
    Entity,
    QueryAllArgs,
    ReliableCreateUserInput,
    MutationUpdateArgs,
    MutationRemoveArgs,
    StrictCreateArgs,
    StrictUpdateArgs
  >['hooksAdd'] = {
    changeListFilter: (hook: ServiceHooksType['changeListFilter']) => hooks.changeListFilter.unshift(hook),
    beforeCreate: (hook: ServiceHooksType['beforeCreate']) => hooks.beforeCreate.unshift(hook),
    beforeCreateStrict: (hook: ServiceHooksType['beforeCreateStrict']) => hooks.beforeCreateStrict.unshift(hook),
    afterCreate: (hook: ServiceHooksType['afterCreate']) => hooks.afterCreate.unshift(hook),
    beforeUpdate: (hook: ServiceHooksType['beforeUpdate']) => hooks.beforeUpdate.unshift(hook),
    afterUpdate: (hook: ServiceHooksType['afterUpdate']) => hooks.afterUpdate.unshift(hook),
    beforeDelete: (hook: ServiceHooksType['beforeDelete']) => hooks.beforeDelete.unshift(hook),
    afterDelete: (hook: ServiceHooksType['afterDelete']) => hooks.afterDelete.unshift(hook),
    beforeUpsert: (hook: ServiceHooksType['beforeUpsert']) => hooks.beforeUpsert.unshift(hook),
    beforeUpsertStrict: (hook: ServiceHooksType['beforeUpsertStrict']) => hooks.beforeUpsertStrict.unshift(hook),
    additionalOperationsOnCreate: (hook: ServiceHooksType['additionalOperationsOnCreate']) =>
      hooks.additionalOperationsOnCreate.unshift(hook),
    additionalOperationsOnUpdate: (hook: ServiceHooksType['additionalOperationsOnUpdate']) =>
      hooks.additionalOperationsOnUpdate.unshift(hook),
    additionalOperationsOnDelete: (hook: ServiceHooksType['additionalOperationsOnDelete']) =>
      hooks.additionalOperationsOnDelete.unshift(hook),
  };

  return {hooksAdd, runHooks};
};

export class HooksUtils<
  Entity extends {},
  QueryAllArgs extends {},
  ReliableCreateUserInput extends {},
  MutationUpdateArgs extends {},
  MutationRemoveArgs extends {},
  StrictCreateArgs extends {} = ReliableCreateUserInput,
  StrictUpdateArgs extends {} = MutationUpdateArgs,
> {
  _hooks;
  hooksAdd;

  constructor() {
    const {hooksAdd, runHooks} = getHooksUtils<
      Entity,
      QueryAllArgs,
      ReliableCreateUserInput,
      MutationUpdateArgs,
      MutationRemoveArgs,
      StrictCreateArgs,
      StrictUpdateArgs
    >();

    this._hooks = runHooks;
    this.hooksAdd = hooksAdd;
  }
}
