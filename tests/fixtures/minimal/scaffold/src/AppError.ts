/* Copied from rlw-back */
import AppErrorCode from './types/AppErrorCode';

class AppError extends Error {
  code?: AppErrorCode;
  details?: Record<string, any>;

  constructor(message: string, code?: AppErrorCode, details?: Record<string, any>) {
    super(message);

    this.code = code;
    this.details = details;
  }
}

export default AppError;
