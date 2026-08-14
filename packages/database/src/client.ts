import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Models that carry a `deletedAt` column and therefore participate in soft
 * deletion. Keep this in sync with the schema — `softDeleteModelsAreValid`
 * below turns a typo into a compile error rather than a silent data leak.
 */
export const SOFT_DELETE_MODELS = [
  'User',
  'Child',
  'VoiceProfile',
  'Story',
  'Book',
  'Address',
  'Asset',
] as const;

export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

// Compile-time proof that every name above is a real Prisma model.
const _softDeleteModelsAreValid: readonly Prisma.ModelName[] = SOFT_DELETE_MODELS;
void _softDeleteModelsAreValid;

const SOFT_DELETE_MODEL_SET: ReadonlySet<string> = new Set(SOFT_DELETE_MODELS);

/**
 * Collection reads whose top-level `where` gains `deletedAt: null`.
 *
 * `findUnique` is deliberately absent: Prisma only accepts unique fields in its
 * `where`, so it cannot be filtered here. Every by-id read in the API goes
 * through `PolicyService`, which asserts both ownership and liveness in one
 * place — see apps/api/src/core/policy.
 */
const TOP_LEVEL_FILTERED_OPERATIONS: ReadonlySet<string> = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Relation graph, model name -> relation field -> target model.
 *
 * Prisma query extensions only intercept the *top-level* operation, so a nested
 * `include: { children: true }` would happily return soft-deleted rows. Walking
 * the DMMF lets the extension inject the same filter at every depth, which is
 * what actually keeps a deleted child or voice profile from reappearing inside
 * a parent object.
 */
interface RelationEdge {
  readonly target: string;
  /**
   * Whether a `where` may be attached to this relation in an `include`.
   *
   * Prisma accepts one on list relations and on *optional* to-one relations —
   * where a non-matching row simply comes back as null. It rejects one on a
   * required to-one relation, because there is no way to represent "the parent
   * is filtered out". Injecting it anyway made every read that included a
   * required parent fail outright, so the shape of the edge has to be known
   * rather than assumed.
   */
  readonly filterable: boolean;
}

type RelationGraph = ReadonlyMap<string, ReadonlyMap<string, RelationEdge>>;

function buildRelationGraph(): RelationGraph {
  const graph = new Map<string, Map<string, RelationEdge>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const relations = new Map<string, RelationEdge>();
    for (const field of model.fields) {
      if (field.kind === 'object') {
        relations.set(field.name, {
          target: field.type,
          filterable: field.isList || !field.isRequired,
        });
      }
    }
    graph.set(model.name, relations);
  }
  return graph;
}

const RELATION_GRAPH: RelationGraph = buildRelationGraph();

type Node = Record<string, unknown>;

function isPlainObject(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An explicit `deletedAt` from the caller always wins, so deletion jobs and
 *  admin screens can still look at removed rows on purpose. */
function withDeletedAtNull(where: unknown): Node {
  if (isPlainObject(where)) {
    return 'deletedAt' in where ? where : { ...where, deletedAt: null };
  }
  return { deletedAt: null };
}

/**
 * Returns a copy of `node` with `deletedAt: null` injected into every nested
 * relation that points at a soft-deletable model. Returns the original object
 * unchanged when there is nothing to do, so the common case allocates nothing.
 */
function filterNestedRelations(model: string, node: Node): Node {
  const relations = RELATION_GRAPH.get(model);
  if (!relations) return node;

  let result: Node | undefined;

  for (const container of ['include', 'select'] as const) {
    const block = node[container];
    if (!isPlainObject(block)) continue;

    let nextBlock: Node | undefined;

    for (const [key, value] of Object.entries(block)) {
      // `_count: { select: { children: true } }` counts relations of this model.
      if (key === '_count') {
        const counted = filterCountBlock(relations, value);
        if (counted !== value) {
          nextBlock = nextBlock ?? { ...block };
          nextBlock[key] = counted;
        }
        continue;
      }

      const edge = relations.get(key);
      if (!edge) continue;
      // A required parent cannot be filtered away; its liveness is the caller's
      // to check, which is what PolicyService does on every by-id read.
      const isSoftDeletable = SOFT_DELETE_MODEL_SET.has(edge.target) && edge.filterable;

      if (value === true) {
        if (!isSoftDeletable) continue;
        nextBlock = nextBlock ?? { ...block };
        nextBlock[key] = { where: { deletedAt: null } };
        continue;
      }

      if (!isPlainObject(value)) continue;

      let child: Node = value;
      if (isSoftDeletable) {
        const filtered = withDeletedAtNull(child.where);
        if (filtered !== child.where) {
          child = { ...child, where: filtered };
        }
      }

      const descended = filterNestedRelations(edge.target, child);
      const changed = descended !== value;
      if (!changed) continue;

      nextBlock = nextBlock ?? { ...block };
      nextBlock[key] = descended;
    }

    if (nextBlock) {
      result = result ?? { ...node };
      result[container] = nextBlock;
    }
  }

  return result ?? node;
}

function filterCountBlock(
  relations: ReadonlyMap<string, RelationEdge>,
  value: unknown,
): unknown {
  if (!isPlainObject(value)) return value;
  const select = value.select;
  if (!isPlainObject(select)) return value;

  let nextSelect: Node | undefined;
  for (const [key, entry] of Object.entries(select)) {
    const edge = relations.get(key);
    if (!edge || !SOFT_DELETE_MODEL_SET.has(edge.target)) continue;

    if (entry === true) {
      nextSelect = nextSelect ?? { ...select };
      nextSelect[key] = { where: { deletedAt: null } };
    } else if (isPlainObject(entry)) {
      const filtered = withDeletedAtNull(entry.where);
      if (filtered !== entry.where) {
        nextSelect = nextSelect ?? { ...select };
        nextSelect[key] = { ...entry, where: filtered };
      }
    }
  }

  return nextSelect ? { ...value, select: nextSelect } : value;
}

export type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

export interface PrismaClientOptions {
  databaseUrl?: string;
  logQueries?: boolean;
}

function baseClientOptions(options: PrismaClientOptions): ConstructorParameters<
  typeof PrismaClient
>[0] {
  return {
    ...(options.databaseUrl ? { datasources: { db: { url: options.databaseUrl } } } : {}),
    log: options.logQueries
      ? (['query', 'warn', 'error'] as const)
      : (['warn', 'error'] as const),
  };
}

export function createPrismaClient(options: PrismaClientOptions = {}) {
  const base = new PrismaClient(baseClientOptions(options));

  return base.$extends({
    name: 'soft-delete',
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query: (args: any) => Promise<unknown>;
        }) {
          if (!model || !isPlainObject(args)) {
            return query(args);
          }

          let next: Node = args;

          if (SOFT_DELETE_MODEL_SET.has(model) && TOP_LEVEL_FILTERED_OPERATIONS.has(operation)) {
            const filtered = withDeletedAtNull(next.where);
            if (filtered !== next.where) {
              next = { ...next, where: filtered };
            }
          }

          // Nested relation filtering applies to every operation, because
          // `update`, `create` and `upsert` can also return relations via
          // `include`.
          next = filterNestedRelations(model, next);

          return query(next);
        },
      },
    },
  });
}

/**
 * Raw client with no soft-delete filtering, for deletion workers and admin
 * screens that legitimately need to see removed rows.
 */
export function createRawPrismaClient(options: PrismaClientOptions = {}): PrismaClient {
  return new PrismaClient(baseClientOptions(options));
}
