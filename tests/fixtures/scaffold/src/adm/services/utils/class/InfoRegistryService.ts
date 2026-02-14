import {AllRequestArgs} from '../../../../utils/types';
import {BaseService, Obj, PrismaLocalDelegation, WithID} from './BaseService';
import {Context, InfoRegistryConfig} from '../../types';
import {DefinedFieldsInRecord, DefinedRecord, PartialFieldsInRecord} from '../../../../types/utils';
import {toPrismaRequest} from '../../../../utils/prisma/toPrismaRequest';

export abstract class InfoRegistryService<
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
  StrictCreateArgsWithoutAutodefinable = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>, // todo: StrictCreateArgs instead of MutationCreateArgs
  MutationCreateArgsWithoutAutodefinable extends Obj = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
  MutationUpdateArgsWithoutAutodefinable extends WithID = PartialFieldsInRecord<MutationUpdateArgs, AutodefinableKeys> & Pick<MutationUpdateArgs, 'id'>, // todo: I added & Pick<MutationUpdateArgs, 'id'>,
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
    public override prismaService: any, // todo: do something about it PrismaClient[keyof PrismaClient],
    public override config: InfoRegistryConfig,
  ) {
    super(ctx, prismaService, config);

    if (config.period === 'notPeriodic') {
      const offMethod = async () => {
        throw new Error('Method does not work for notPeriodic info registries');
      };

      this.sliceOfTheLast = offMethod;
      this.sliceOfTheFirst = offMethod;
    }
  }

  async sliceOfTheLast(
    date?: Date,
    filter?: QueryAllArgs['filter'],
  ): Promise<Entity | null> {
    return this.prismaService.findFirst(toPrismaRequest({
      sortField: 'date',
      sortOrder: 'desc',
      filter: {
        ...filter,
        date_lte: date ?? new Date(),
      },
    }, {noId: false}));
  }

  async sliceOfTheFirst(
    date?: Date,
    filter?: QueryAllArgs['filter'],
  ): Promise<Entity | null> {
    return this.prismaService.findFirst(toPrismaRequest({
      sortField: 'date',
      sortOrder: 'asc',
      filter: {
        ...filter,
        date_gte: date ?? new Date(),
      },
    }, {noId: false}));
  }
}
