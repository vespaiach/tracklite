import { useDispatch } from "react-redux";
import type { ApiFailure } from "./api";
import { showToast } from "./toast";

export function useFailureToast() {
  const dispatch = useDispatch();
  return (caught: unknown) => dispatch(showToast((caught as ApiFailure).message));
}