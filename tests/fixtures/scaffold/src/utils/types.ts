/* Copied from rlw-back */
export interface AllRequestArgs {
  filter?: Record<string, any> | null;
  page?: number | null;
  perPage?: number | null;
  sortField?: string | null;
  sortOrder?: string | null;
}

export interface IOptions {
  noId?: boolean;
}
