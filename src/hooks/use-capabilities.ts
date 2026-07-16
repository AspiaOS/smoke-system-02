import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStoreContext, type MyStoreContext } from "@/lib/authz/store.functions";
import type { Capability } from "@/lib/authz/matrix";

export function useMyStoreContext() {
  const fetchCtx = useServerFn(getMyStoreContext);
  return useQuery<MyStoreContext>({
    queryKey: ["my-store-context"],
    queryFn: () => fetchCtx({}),
    staleTime: 60_000,
  });
}

export function useCapabilities(): {
  loading: boolean;
  role: MyStoreContext["role"];
  can: (cap: Capability) => boolean;
  canAny: (caps: Capability[]) => boolean;
} {
  const { data, isLoading } = useMyStoreContext();
  const caps = new Set(data?.capabilities ?? []);
  return {
    loading: isLoading,
    role: data?.role ?? null,
    can: (cap) => caps.has(cap),
    canAny: (list) => list.some((c) => caps.has(c)),
  };
}
