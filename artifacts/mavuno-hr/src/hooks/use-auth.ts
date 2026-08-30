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
  };
}
