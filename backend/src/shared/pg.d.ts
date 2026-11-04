/**
 * Minimal local typings for `pg`.
 *
 * The repo needs only Pool.query for the idempotent money-loop DDL, so this
 * declares exactly that instead of pulling a types package into the deploy
 * image. Widen this if the pool is ever used elsewhere.
 */
declare module "pg" {
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    connectionTimeoutMillis?: number;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    end(): Promise<void>;
  }
}
