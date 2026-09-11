import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

export function useAuth() {
  const { data: user, isLoading, error, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      staleTime: 30_000,
    }
  });

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin' || user?.role === 'hr';
  const isEmployee = !!user?.employeeId;
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;
  // Not yet in the generated client's Me type — same cast pattern as isSuperAdmin above.
  const accessUntil: string | null = (user as any)?.accessUntil ?? null;
  const accessState: "active" | "expiring_soon" | "expired" | "unlimited" =
    (user as any)?.accessState ?? "unlimited";

  return {
    user,
    org: {
      slug: user?.orgSlug,
      countryCode: user?.countryCode,
      currencyCode: user?.currencyCode,
    },
    isLoading,
    isError,
    error,
    isAuthenticated,
    isAdmin,
    isEmployee,
    isSuperAdmin,
    accessUntil,
    accessState,
  };
}
