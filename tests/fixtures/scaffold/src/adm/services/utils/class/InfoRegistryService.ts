/* Stub: InfoRegistryService — abstract base for info-registry-type entities */
import {AllRequestArgs} from '../../../../utils/types';
import {BaseService, PrismaLocalDelegation, WithID} from './BaseService';
import {Context, InfoRegistryConfig} from '../../types';
import {DefinedFieldsInRecord, DefinedRecord, PartialFieldsInRecord} from '../../../../types/utils';

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
  AllowedForUserCreateInput extends {} = Omit<MutationCreateArgs, ForbidenForUserKeys>,
  StrictCreateArgs extends {} = DefinedFieldsInRecord<MutationCreateArgs, RequiredDbNotUserKeys> & AutodefinablePart,
  StrictUpdateArgs extends WithID = DefinedFieldsInRecord<MutationUpdateArgs, RequiredDbNotUserKeys> & AutodefinablePart,
  StrictCreateArgsWithoutAutodefinable = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
  MutationCreateArgsWithoutAutodefinable extends {} = PartialFieldsInRecord<MutationCreateArgs, AutodefinableKeys>,
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
    public override config: InfoRegistryConfig,
  ) {
    super(ctx, prismaService, config);
  }

  async getSlice(_filter: Record<string, unknown>): Promise<Entity[]> {
    return [];
  }

  async getLastSlice(_filter: Record<string, unknown>): Promise<Entity | null> {
    return null;
  }
}
