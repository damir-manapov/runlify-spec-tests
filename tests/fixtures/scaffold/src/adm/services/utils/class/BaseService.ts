/* Copied from rlw-back: BaseService — the abstract base for all generated services */
import {HooksUtils} from '../../getHooksUtils';
import {Context, ServiceConfig} from '../../types';
import {Prisma, PrismaPromise} from '@prisma/client';
import {toPrismaRequest} from '../../../../utils/prisma/toPrismaRequest';
import {AllRequestArgs} from '../../../../utils/types';
import {toPrismaTotalRequest} from '../../../../utils/prisma/toPrismaTotalRequest';
import {ListMetadata} from '../../../../generated/graphql';
import {DefinedFieldsInRecord, DefinedRecord, PartialFieldsInRecord} from '../../../../types/utils';
import * as R from 'ramda';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import {v4 as uuidv4} from 'uuid';
import {serviceUtils, ServiceUtils} from './utils';
import AppError from '../../../../AppError';
import {ServiceErrors} from './ServiceErrors';
import {prismaErrorCodes} from './PrismaErrorCodes';
import {toPrismaWhere} from '../../../../utils/prisma/toPrismaWhere';

export type WithID = {id: bigint | string | number};
export type Obj = Record<string, any>;

export const toLogId = (entity: WithID): string | number => (typeof entity.id === 'bigint' ? entity.id.toString() : entity.id);

export type PrismaLocalDelegation<Entity extends WithID> = {
  findMany: (arg: any) => Promise<Entity[]>;
  findFirst: (arg: any) => Promise<Entity | null>;
  count: (arg: any) => Promise<Prisma.BatchPayload | number>;
  create: (arg: any) => PrismaPromise<Entity>;
  update: (arg: any) => PrismaPromise<Entity>;
  upsert: (arg: any) => PrismaPromise<Entity>;
  createMany: (arg: any) => PrismaPromise<Prisma.BatchPayload>;
  createManyAndReturn: (arg: any) => PrismaPromise<Entity[]>;
  delete: (arg: any) => PrismaPromise<Entity>;
  groupBy: (arg: any) => Promise<Array<{_sum: Record<string, number | null>}>>;
  aggregate: (arg: any) => PrismaPromise<any>;
};

export abstract class BaseService<
  Entity extends WithID,
  MutationCreateArgs extends {},
  MutationUpdateArgs extends WithID,
  MutationRemoveArgs extends WithID,
  QueryAllArgs extends AllRequestArgs,
  AutodefinableKeys extends keyof Entity & keyof MutationCreateArgs & keyof MutationUpdateArgs,
  ForbidenForUserKeys extends keyof Entity & keyof MutationCreateArgs & keyof MutationUpdateArgs,
  RequiredDbNotUserKeys extends keyof Entity & keyof MutationCreateArgs & keyof MutationUpdateArgs,
  PrismaDelegate extends PrismaLocalDelegation<Entity>,
  AutodefinablePart extends {} = DefinedRecord<Pick<MutationCreateArgs, AutodefinableKeys>>,
  ReliableCreateUserInput extends {} = Omit<MutationCreateArgs, ForbidenForUserKeys> & AutodefinablePart,
  AllowedForUserCreateInput extends Obj = Omit<MutationCreateArgs, ForbidenForUserKeys>,
  StrictCreateArgs extends {} = DefinedFieldsInRecord<MutationCreateArgs, RequiredDbNotUserKeys> & AutodefinablePart,
  StrictUpdateArgs extends WithID = DefinedFieldsInRecord<MutationUpdateArgs, RequiredDbNotUserKeys> & AutodefinablePart,
  StrictCreateArgsWithoutAutodefinable = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
  MutationCreateArgsWithoutAutodefinable extends Obj = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
  MutationUpdateArgsWithoutAutodefinable extends WithID = PartialFieldsInRecord<MutationUpdateArgs, AutodefinableKeys> & Pick<MutationUpdateArgs, 'id'>,
> extends HooksUtils<Entity, QueryAllArgs, ReliableCreateUserInput, MutationUpdateArgs, MutationRemoveArgs, StrictCreateArgs, StrictUpdateArgs> {
  protected getSearchString = (entry: Record<string, any>) => [
    ...R.toPairs(R.pick(this.config.otherFields, entry))
      .map((el) => (el[1] as any)?.toString()?.toLowerCase() ?? ''),
    ...R.toPairs(R.pick(this.config.dateFields, entry))
      .map((el) => dayjs(el[1] as Date).utc().format('DD.MM.YYYY') ?? ''),
  ].join(' ');

  augmentByDefault = async <T>(
    currentData: Obj,
  ): Promise<T & AutodefinablePart> => currentData as T & AutodefinablePart;

  allowedToChange = (_e: Entity | ReliableCreateUserInput | StrictCreateArgs | StrictUpdateArgs, _serviceUtils: ServiceUtils): boolean => true;

  async validate(_data: StrictCreateArgs | StrictUpdateArgs | Entity): Promise<void> {}

  constructor(
    protected ctx: Context,
    public prismaService: PrismaDelegate,
    public config: ServiceConfig,
  ) {
    super();

    const boundValidate = this.validate.bind(this);

    const validate = async <T extends StrictCreateArgs | StrictUpdateArgs> (_: Context, data: T): Promise<T> => {
      await boundValidate(data);
      return data;
    };

    const validateUpsert = async (_: Context, data: {
      createData: ReliableCreateUserInput;
      updateData: StrictUpdateArgs;
    }) => {
      await boundValidate(data.updateData);
      return data as unknown as {
        createData: StrictCreateArgs;
        updateData: StrictUpdateArgs;
      };
    };

    this.hooksAdd.beforeCreate(validate as any);
    this.hooksAdd.beforeUpdate(validate);
    this.hooksAdd.beforeUpsert(validateUpsert);
  }

  async all(
    params: QueryAllArgs = {} as QueryAllArgs,
    byUser = false,
  ): Promise<Entity[]> {
    const requestParams = byUser ? await this._hooks.changeListFilter(this.ctx, params) : params;

    return this.prismaService.findMany(
      toPrismaRequest(
        requestParams,
        {noId: false},
      ),
    ) as Promise<Entity[]>;
  }

  async findOne(
    params: QueryAllArgs = {} as QueryAllArgs,
    byUser = false,
  ): Promise<Entity | null> {
    const requestParams = byUser ? await this._hooks.changeListFilter(this.ctx, params) : params;

    return this.prismaService.findFirst(toPrismaRequest(
      requestParams,
      {noId: false},
    ));
  }

  async findOneRequired(
    params: QueryAllArgs = {} as QueryAllArgs,
    byUser = false,
  ): Promise<Entity> {
    const found = await this.findOne(params, byUser);

    if (!found) {
      throw new Error(`There is no entry with "${JSON.stringify(params)}" filter`);
    }

    return found;
  }

  async get(
    id: Entity['id'],
    byUser = false,
  ): Promise<Entity | null> {
    return this.findOne({filter: {id}} as unknown as QueryAllArgs, byUser);
  }

  async getRequired(
    id: Entity['id'],
    byUser = false,
  ): Promise<Entity> {
    const found = await this.get(id, byUser);

    if (!found) {
      throw new Error(`There is no entry with "${id}" id`);
    }

    return found;
  }

  async count(
    params: Omit<QueryAllArgs, 'sortField' | 'sortOrder'> = {} as Omit<QueryAllArgs, 'sortField' | 'sortOrder'>,
    byUser = false,
  ): Promise<number> {
    const requestParams = byUser ? await this._hooks.changeListFilter(this.ctx, params as QueryAllArgs) : params;

    return this.prismaService.count(
      toPrismaTotalRequest(requestParams),
    ) as unknown as Promise<number>;
  }

  async meta(
    params: Omit<QueryAllArgs, 'sortField' | 'sortOrder'> = {} as Omit<QueryAllArgs, 'sortField' | 'sortOrder'>,
    byUser = false,
  ): Promise<ListMetadata> {
    return this.count(params, byUser).then(count => ({count}));
  }

  async create(
    data: MutationCreateArgsWithoutAutodefinable,
    byUser = false,
  ): Promise<Entity> {
    const cleared = byUser ?
      R.omit(this.config.forbiddenForUserFields, data) as AllowedForUserCreateInput :
      data;

    const augmentedByDefault: ReliableCreateUserInput = await this.augmentByDefault(cleared as Obj);

    const processedData: StrictCreateArgs = await this._hooks.beforeCreate(this.ctx, augmentedByDefault);

    const createData = {
      id: this.config.autogeneratedStringId ? uuidv4() : undefined,
      ...R.mergeDeepLeft(
        processedData,
        this.config.withSearch ? {
          search: this.getSearchString(processedData),
        } : {},
      ),
    } as unknown as ReliableCreateUserInput;

    if (!this.allowedToChange(createData, serviceUtils)) {
      throw new Error(ServiceErrors.DoNotAllowToChange);
    }

    try {
      const createOperation = this.prismaService.create({
        data: createData,
      });
      const operations = [
        createOperation,
        ...(await this._hooks.additionalOperationsOnCreate(this.ctx, createData)),
      ];
      const [result] = await this.ctx.prisma.$transaction(operations);
      if (!result) {
        throw new Error('There is no such entity');
      }

      await Promise.all([
        !this.config.autogeneratedStringId && this.config.withSearch &&
        this.prismaService.update({
          where: {id: result.id},
          data: {
            search: this.getSearchString(result),
          },
        }),
        this.ctx.prisma.$transaction(await this.getPostOperations(result)),
      ]);

      await this._hooks.afterCreate(this.ctx, result as Entity);

      return result as Entity;
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.catchPrismaError(error);
      }
      throw error;
    }
  }

  async createMany(
    entries: StrictCreateArgsWithoutAutodefinable[],
    byUser = false,
  ): Promise<Prisma.BatchPayload> {
    if (entries.length === 0) {
      return {count: 0};
    }

    const clearedData = byUser ? entries.map(data => R.omit(this.config.forbiddenForUserFields as unknown as Array<keyof StrictCreateArgsWithoutAutodefinable>, data)) : entries;

    let augmentedByDefault = await Promise.all(
      clearedData.map(el => this.augmentByDefault(el)),
    ) as StrictUpdateArgs[];

    if (this.config.autogeneratedStringId) {
      augmentedByDefault = R.map((record) => R.mergeRight({id: uuidv4()}, record), augmentedByDefault as any) as unknown as StrictUpdateArgs[];
    }

    if (!R.all((d) => this.allowedToChange(d, serviceUtils), augmentedByDefault)) {
      throw new Error(ServiceErrors.DoNotAllowToChange);
    }

    try {
      const additionalOperations = await Promise.all(augmentedByDefault.map((d) => this._hooks.additionalOperationsOnCreate(this.ctx, d as unknown as ReliableCreateUserInput)));

      const createOperation = this.prismaService.createMany({
        data: augmentedByDefault.map(data => R.mergeDeepLeft(
          data,
          this.config.withSearch ? {
            search: this.getSearchString(data),
          } : {},
        )),
        skipDuplicates: true,
      });

      const result = await this.ctx.prisma.$transaction([
        createOperation,
        ...R.unnest(additionalOperations),
      ]);

      if (!result?.[0]) {
        throw new Error('There is no such entity');
      }

      return result?.[0];
    } catch (error) {
      throw error;
    }
  }

  async update(
    data: MutationUpdateArgsWithoutAutodefinable,
    byUser = false,
  ): Promise<Entity> {
    const dbVersion = await this.getRequired(data.id);

    const cleared = byUser ? R.omit(this.config.forbiddenForUserFields as unknown as Array<keyof MutationUpdateArgsWithoutAutodefinable>, data) : data;

    const augmentedByDb = R.mergeLeft(cleared, dbVersion);

    const augmentedByDefault = await this.augmentByDefault(augmentedByDb) as StrictUpdateArgs;

    if (!this.allowedToChange(augmentedByDefault, serviceUtils)) {
      throw new Error(ServiceErrors.DoNotAllowToChange);
    }

    try {
      const processedData = await this._hooks.beforeUpdate(this.ctx, augmentedByDefault);

      const {id, ...rest} = processedData;

      const updateOperation = this.prismaService.update({
        data: R.mergeDeepLeft(
          this.config.withSearch ? {
            search: this.getSearchString(processedData),
          } : {},
          rest,
        ),
        where: {
          id: id as Entity['id'],
        },
      });

      const operations: PrismaPromise<any>[] = [
        updateOperation,
        ...(await this._hooks.additionalOperationsOnUpdate(
          this.ctx,
          processedData as unknown as MutationUpdateArgs,
        )),
        ...(await this.getPostOperations(processedData)),
      ];

      const [result] = await this.ctx.prisma.$transaction(operations);

      if (!result) {
        throw new Error('There is no such entity');
      }

      await this._hooks.afterUpdate(this.ctx, result);

      return result as Entity;
    } catch (error) {
      throw error;
    }
  }

  async upsert(
    data: PartialFieldsInRecord<MutationUpdateArgsWithoutAutodefinable, 'id'>,
    byUser = false,
  ): Promise<Entity> {
    const dbVersion = data.id ? await this.get(data.id) : null;

    const cleared = byUser ? R.omit(this.config.forbiddenForUserFields as unknown as Array<keyof PartialFieldsInRecord<MutationUpdateArgsWithoutAutodefinable, 'id'>>, data) : data;

    const augmentedByDefault = await this.augmentByDefault(cleared) as any;

    const augmented = R.mergeLeft(augmentedByDefault, dbVersion || {} as Entity);

    if (!this.allowedToChange(augmented, serviceUtils)) {
      throw new Error(ServiceErrors.DoNotAllowToChange);
    }

    try {
      const processedData = await this._hooks.beforeUpsert(this.ctx, {createData: augmented, updateData: augmented});
      let createData = processedData.createData;
      let updateData = processedData.updateData;

      if (this.config.withSearch) {
        createData = {
          ...createData,
          search: this.getSearchString(createData),
        };
        updateData = {
          ...updateData,
          search: this.getSearchString(processedData.updateData),
        };
      }

      const result = await this.prismaService.upsert({
        create: createData,
        update: updateData,
        where: {id: data.id},
      });

      if (!result) {
        throw new Error('There is no such entity');
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  async delete(
    params: MutationRemoveArgs,
    byUser = false,
  ): Promise<Entity> {
    await this._hooks.beforeDelete(this.ctx, params);

    const entity = await this.get(params.id, byUser);

    if (!entity) {
      throw new Error(`There is no entity with "${params.id}" id`);
    }

    if (!this.allowedToChange(entity, serviceUtils)) {
      throw new Error(ServiceErrors.DoNotAllowToChange);
    }

    try {
      const deleteOperation = this.prismaService.delete({
        where: {
          id: params.id,
        },
      });

      const operations: PrismaPromise<any>[] = [
        deleteOperation,
        ...(await this._hooks.additionalOperationsOnDelete(this.ctx, params)),
        ...(await this.getUnPostOperations(params.id)),
      ];

      const [result] = await this.ctx.prisma.$transaction(operations);

      if (!result) {
        throw new Error('There is no such entity');
      }

      await this._hooks.afterDelete(this.ctx, entity);

      return entity;
    } catch (error) {
      throw error;
    }
  }

  catchPrismaError(error: Prisma.PrismaClientKnownRequestError): never {
    const code = error.code ? prismaErrorCodes[error.code] : undefined;
    if (code && error.meta) {
      const target = error.meta.target;
      const fields = Array.isArray(target) ? target : target ? [target] : [];
      let message = error.message;
      if (error.code === 'P2002') {
        message = fields.length > 0
          ? `Нарушена уникальность по полям: (${fields.join(', ')})`
          : 'Запись с такими данными уже существует';
      }
      throw new AppError(message, code, {fields: target});
    }
    throw error;
  }

  protected async getPostOperations(_data: StrictUpdateArgs | Entity): Promise<PrismaPromise<any>[]> {
    return [];
  }
  protected async getUnPostOperations(_id: Entity['id']): Promise<PrismaPromise<any>[]> {
    return [];
  }
}
