import { createContext, useContext } from "react";

/** OTG people (Event Planner users) offered as suggestions in name columns. */
const PeopleCtx = createContext<string[]>([]);
export const PeopleProvider = PeopleCtx.Provider;
export function usePeopleNames() {
  return useContext(PeopleCtx);
}
