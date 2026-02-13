/* Copied from rlw-back */
import AppErrorCode from '../../../../types/AppErrorCode';

type PrismaErrorCodesType = {
  [key: string]: AppErrorCode,
};

export const prismaErrorCodes: PrismaErrorCodesType = {
  P2002: AppErrorCode.Duplication,
  P2003: AppErrorCode.ForeignKeyConstraint,
};
