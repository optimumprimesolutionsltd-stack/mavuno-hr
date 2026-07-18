import { useGetMe } from "@workspace/api-client-react";

export function useAuth() {
  const { data: user, isLoading, error, isError } = useGetMe({
    query: {
      retry: false,
      staleTime: 30_000,
    }
  });

  const isAuthenticated = !!user;
  const isAdmin = user?.role === 'admin' || user?.role === 'hr';
  const isEmployee = !!user?.employeeId;

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
  };
}
