import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

export function useTokenFromAddress() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!searchParams.has("token")) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete("token");
    navigate({ pathname, search: rest.toString(), hash }, { replace: true });
  }, [searchParams, pathname, hash, navigate]);

  return token;
}