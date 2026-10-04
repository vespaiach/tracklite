import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Toasts } from "../components/ui/track-lite";
import { useAppSelector } from "./store";
import { hideToast } from "./toast";

export function Toaster() {
  const toast = useAppSelector((state) => state.toast);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => dispatch(hideToast()), 5000);
    return () => clearTimeout(timer);
  }, [toast, dispatch]);

  return <Toasts items={toast ? [{ ...toast, tone: "err" }] : []} />;
}