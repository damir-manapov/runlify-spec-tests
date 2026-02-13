/* Stub: DocumentBaseService — abstract base for document-type entities */
import {AllRequestArgs} from '../../../../utils/types';
import {BaseService, Obj, PrismaLocalDelegation, WithID} from './BaseService';
import {Context, DocumentConfig} from '../../types';
import {Prisma, PrismaPromise} from '@prisma/client';
import {DefinedFieldsInRecord, DefinedRecord, PartialFieldsInRecord} from '../../../../types/utils';
import {serviceUtils} from './utils';
import {ServiceErrors} from './ServiceErrors';

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
}
