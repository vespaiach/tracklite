import { useEffect, useState } from "react";

export function useShowLoading(pending: boolean) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(timer);
  }, [pending]);

  return show;
}