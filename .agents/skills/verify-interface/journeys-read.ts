import { pluckModes, pagination, sorting, foreignResolve, foreignRaw, defaultFilter, customFilters, localizedKey } from "./journeys-read-1.ts";
import { joinedRead, computedRead, getGuard, guardUnlocked, amendBody, customRoute, effectiveModes, declarationErrors, exportsRuntime, consumerCompiles } from "./journeys-read-2.ts";

export const READ_JOURNEYS = {
  "pluck-modes": pluckModes,
  pagination,
  sorting,
  "foreign-resolve": foreignResolve,
  "foreign-raw": foreignRaw,
  "default-filter": defaultFilter,
  "custom-filters": customFilters,
  "localized-key": localizedKey,
  "joined-read": joinedRead,
  "computed-read": computedRead,
  "get-guard": getGuard,
  "guard-unlocked": guardUnlocked,
  "amend-body": amendBody,
  "custom-route": customRoute,
  "effective-modes": effectiveModes,
  "declaration-errors": declarationErrors,
  "exports-runtime": exportsRuntime,
  "consumer-compiles": consumerCompiles,
};
