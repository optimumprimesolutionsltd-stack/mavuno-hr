export function fullName(employee: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}): string {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter((s): s is string => !!s)
    .join(" ");
}
