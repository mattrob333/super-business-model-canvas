import { supabase } from "@/integrations/supabase/client";

/**
 * Narrow, documented escape hatch (reviewed under RF-4-10): the generated
 * Database type is now large enough that some multi-filter queries against
 * late-declared tables (e.g. `metric_snapshots`) trip TS2589 "type
 * instantiation is excessively deep". Use the typed client by default; reach
 * for this ONLY when tsc fails with TS2589, keep the row type explicit at the
 * call site, and always filter by account_id — nothing here relaxes RLS.
 */
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
  update(value: unknown): UntypedQuery<T>;
  delete(): UntypedQuery<T>;
  eq(column: string, value: unknown): UntypedQuery<T>;
  contains(column: string, value: Record<string, unknown>): UntypedQuery<T>;
  is(column: string, value: unknown): UntypedQuery<T>;
  in(column: string, value: unknown[]): UntypedQuery<T>;
  or(filters: string): UntypedQuery<T>;
  order(column: string, options?: Record<string, unknown>): UntypedQuery<T>;
  limit(count: number): UntypedQuery<T>;
  range(from: number, to: number): UntypedQuery<T>;
  maybeSingle(): Promise<SingleResponse<T>>;
  single(): Promise<SingleResponse<T>>;
}

export interface UntypedSupabase {
  from<T = Record<string, unknown>>(table: string): UntypedQuery<T>;
}

export const supabaseUntyped = supabase as unknown as UntypedSupabase;

