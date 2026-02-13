/* Scaffold: context — creates real Context with PrismaClient and services */
import {PrismaClient} from '@prisma/client';
import log from '../../log';
import serviceConstrictors from './serviceConstrictors';
import type {Context, Services} from './types';

export const createContext = async (_container?: unknown): Promise<Context> => {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_MAIN_WRITE_URI,
  });

  const services: Partial<Services> = {};

  const context: Context = {
    prisma,
    log,
    close: async () => {
      await prisma.$disconnect();
    },
    service: <N extends keyof Services>(name: N): Services[N] => {
      if (!services[name]) {
        const constructor = (serviceConstrictors as Record<string, (ctx: Context) => any>)[name as string];
        if (!constructor) {
          throw new Error(`Unknown service: ${String(name)}`);
        }
        services[name] = constructor(context);
      }
      return services[name] as Services[N];
    },
  };

  return context;
};
