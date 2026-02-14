/* Copied from rlw-back: DocumentBaseService — abstract base for document-type entities */
import {AllRequestArgs} from '../../../../utils/types';
import {BaseService, Obj, PrismaLocalDelegation, toLogId, WithID} from './BaseService';
import {Context, DocumentConfig} from '../../types';
import {Prisma, PrismaPromise} from '@prisma/client';
import {DefinedFieldsInRecord, DefinedRecord, PartialFieldsInRecord} from '../../../../types/utils';
import * as R from 'ramda';
import pluralize from 'pluralize';
import {serviceUtils} from './utils';
import {ServiceErrors} from './ServiceErrors';

export const getRegistrarFields = R.pick(['row', 'registrarTypeId', 'registrarId']);

export abstract class DocumentBaseService<
  Entity extends WithID,
  MutationCreateArgs extends {},
  MutationUpdateArgs extends WithID,
  MutationRemoveArgs extends WithID,
  QueryAllArgs extends AllRequestArgs,
  AutodefinableKeys extends keyof Entity & keyof MutationCreateArgs & keyof MutationUpdateArgs,
  ForbidenForUserKeys extends keyof Entity & keyof MutationCreateArgs & keyof MutationUpdateArgs,
  RequiredDbNotUserKeys extends keyof Entity & keyof MutationCreateArgs & keyof MutationUpdateArgs,
  RegistryEntries extends {},
  PrismaDelegate extends PrismaLocalDelegation<Entity>,
  AutodefinablePart extends {} = DefinedRecord<Pick<MutationCreateArgs, AutodefinableKeys>>,
  ReliableCreateUserInput extends {} = Omit<MutationCreateArgs, ForbidenForUserKeys> & AutodefinablePart,
  AllowedForUserCreateInput extends Obj = Omit<MutationCreateArgs, ForbidenForUserKeys>,
  StrictCreateArgs extends {} = DefinedFieldsInRecord<MutationCreateArgs, RequiredDbNotUserKeys> & AutodefinablePart,
  StrictUpdateArgs extends WithID = DefinedFieldsInRecord<MutationUpdateArgs, RequiredDbNotUserKeys> & AutodefinablePart,
  StrictCreateArgsWithoutAutodefinable = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
  MutationCreateArgsWithoutAutodefinable extends Obj = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
  MutationUpdateArgsWithoutAutodefinable extends WithID = PartialFieldsInRecord<MutationUpdateArgs, AutodefinableKeys> & Pick<MutationUpdateArgs, 'id'>,
> extends BaseService<
    Entity,
    MutationCreateArgs,
    MutationUpdateArgs,
    MutationRemoveArgs,
    QueryAllArgs,
    AutodefinableKeys,
    ForbidenForUserKeys,
    RequiredDbNotUserKeys,
    PrismaDelegate,
    AutodefinablePart,
    ReliableCreateUserInput,
    AllowedForUserCreateInput,
    StrictCreateArgs,
    StrictUpdateArgs,
    StrictCreateArgsWithoutAutodefinable,
    MutationCreateArgsWithoutAutodefinable,
    MutationUpdateArgsWithoutAutodefinable
  > {

  constructor(
    protected override ctx: Context,
    public override prismaService: any,
    public override config: DocumentConfig,
  ) {
    super(ctx, prismaService, config);
  }

  async post(data: Entity): Promise<void> {
    if (!this.allowedToChange(data, serviceUtils)) {
      throw new Error(ServiceErrors.DoNotAllowToChange);
    }
    const augmentedData = await this.augmentByDefault(data) as unknown as StrictUpdateArgs;
    await this.ctx.prisma.$transaction(await this.getPostOperations(augmentedData));
  }

  async rePost(id: Entity['id'], byUser = false): Promise<void> {
    const data = await this.get(id, byUser);
    if (!data) {
      throw new Error(`There is no document with "${id}" id`);
    }
    await this.post(data);
  }

  async getRegistryEntries(_data: StrictUpdateArgs | Entity): Promise<RegistryEntries> {
    return this.config.registries.reduce((accum, key) => ({
      ...accum,
      [key]: [],
    }), {} as RegistryEntries);
  }

  override async getPostOperations(data: StrictUpdateArgs | Entity): Promise<PrismaPromise<any>[]> {
    const registries: string[] = this.config.registrarDependedRegistries;
    if (registries.length === 0) {
      return [];
    }

    const cus = await this.getRegistryEntries(data);
    const customOps: PrismaPromise<any>[] = [];

    for (const registry of registries) {
      const entries = (cus as any)[registry] as Record<string, unknown>[];
      for (const en of entries) {
        const createData: Record<string, unknown> = {
          ...en,
          registrarTypeId: this.config.entityTypeId,
          registrarId: data.id,
        };
        customOps.push(
          (this.ctx.prisma as any)[registry].create({ data: createData }),
        );
      }
    }

    return [
      await this.getUnPostOperations(data.id),
      customOps,
    ].flat();
  }

  override async getUnPostOperations(id: Entity['id']) {
    return this.config.registries.flatMap(registry => {
      return [
        (this.ctx.prisma as any)[registry].deleteMany({
          where: {
            registrarTypeId: this.config.entityTypeId,
            registrarId: id,
          },
        }),
      ];
    });
  }

  async cancel(
    id: Entity['id'],
    byUser = false,
  ): Promise<void> {
    const data: any = await this.get(id, byUser);
    if (!data) {
      throw new Error('Запись не найдена!');
    }

    if ('cancelled' in data && data.cancelled && data.dateToCancelled) {
      throw new Error('Документ уже отменен!');
    }

    await this.update({
      ...data,
      cancelled: true,
      dateToCancelled: new Date(),
    });
  }

  override async create(data: MutationCreateArgsWithoutAutodefinable, byUser?: boolean): Promise<Entity> {
    const createdEntity = await super.create(data, byUser);

    const registries = this.config.registrarDependedRegistries;
    if (registries.length === 0) {
      return createdEntity;
    }

    await this.afterPostHandle(createdEntity, registries, {useCreatedEntries: true});

    return createdEntity;
  }

  override async update(data: MutationUpdateArgsWithoutAutodefinable, byUser?: boolean): Promise<Entity> {
    const updatedEntity = await super.update(data, byUser);

    await this.rePost(updatedEntity.id);
    return updatedEntity;
  }

  override async createMany(
    entries: StrictCreateArgsWithoutAutodefinable[],
    byUser = false,
  ): Promise<Prisma.BatchPayload> {
    return super.createMany(entries, byUser);
  }

  override async delete(
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

      const registries = this.config.registrarDependedRegistries;
      if (registries.length === 0) {
        return entity;
      }

      await this.afterPostHandle(entity, registries);

      return entity;
    } catch (error) {
      throw error;
    }
  }

  async afterPostHandle(
    entity: Entity,
    registries: string[],
    _options?: {useCreatedEntries?: boolean},
  ): Promise<void> {
    for (const registry of registries) {
      const serviceName = pluralize(registry, 2);
      const registryService = this.ctx.service(serviceName as any);
      if (registryService && typeof (registryService as any).afterPost === 'function') {
        const registryEntries = await this.getRegistryEntries(entity);
        const entries = (registryEntries as any)[registry];
        await (registryService as any).afterPost(entries);
      }
    }
  }
}
