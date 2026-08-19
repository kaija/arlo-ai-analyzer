/**
 * Re-export shim — keeps existing imports working while the canonical
 * implementation lives inside SessionsContext.tsx.
 *
 * Components that need access to the full sessions context should import
 * `useSessionsContext` from `../context/SessionsContext` instead.
 */
export { useSessionsContext as useSessions } from "../context/SessionsContext";
