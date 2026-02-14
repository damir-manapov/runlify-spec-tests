import {AllRequestArgs} from '../../../../utils/types';
import {DefinedFieldsInRecord, DefinedRecord, PartialFieldsInRecord} from '../../../../types/utils';
import {BaseService, Obj, PrismaLocalDelegation, WithID} from './BaseService';

export abstract class SumRegistryService<
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
  async afterPost(_postOperations: any[]) {}
}
