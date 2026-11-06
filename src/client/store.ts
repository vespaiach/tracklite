import { configureStore } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import type { DataRouter } from "react-router";
import { api } from "./api";
import { toastSlice } from "./toast";

export type StoreExtra = { router: DataRouter };

export function makeStore(router: DataRouter) {
  const extra: StoreExtra = { router };
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer, toast: toastSlice.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: extra } }).concat(api.middleware),
  });
}

type RootState = ReturnType<ReturnType<typeof makeStore>["getState"]>;

export const useAppSelector = useSelector.withTypes<RootState>();