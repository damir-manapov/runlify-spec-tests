/* Copied from rlw-back */
export type PartialMaybe<T> = {
  [P in keyof T]?: T[P] | null;
};

export type NonNullableRecord<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

export type DefinedRecord<T> = NonNullableRecord<Required<T>>;

export type DefinedFieldsInRecord<T, K extends keyof T> = T & DefinedRecord<Pick<T, K>>;

export type PartialFieldsInRecord<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
