import { supabase } from "@/integrations/supabase/client";

export interface QueryError {
  message: string;
}

export interface QueryResponse<T> {
  data: T[] | null;
  error: QueryError | null;
}

export interface SingleResponse<T> {
  data: T | null;
  error: QueryError | null;
}

export interface UntypedQuery<T> extends PromiseLike<QueryResponse<T>> {
  select(columns?: string, options?: Record<string, unknown>): UntypedQuery<T>;
  insert(value: unknown): UntypedQuery<T>;
  eq(column: string, value: unknown): UntypedQuery<T>;
  is(column: string, value: unknown): UntypedQuery<T>;
  in(column: string, value: unknown[]): UntypedQuery<T>;
  or(filters: string): UntypedQuery<T>;
  order(column: string, options?: Record<string, unknown>): UntypedQuery<T>;
  limit(count: number): UntypedQuery<T>;
  maybeSingle(): Promise<SingleResponse<T>>;
  single(): Promise<SingleResponse<T>>;
}

export interface UntypedSupabase {
  from<T = Record<string, unknown>>(table: string): UntypedQuery<T>;
}

export const supabaseUntyped = supabase as unknown as UntypedSupabase;

