import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type ToastState = { id: number; message: string } | null;

export const toastSlice = createSlice({
  name: "toast",
  initialState: null as ToastState,
  reducers: {
    showToast: (state, action: PayloadAction<string>) => ({
      id: (state?.id ?? 0) + 1,
      message: action.payload,
    }),
    hideToast: () => null,
  },
});

export const { showToast, hideToast } = toastSlice.actions;