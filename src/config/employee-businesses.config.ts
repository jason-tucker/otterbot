// Configuration for the /employee command.
// Edit this file to add/remove businesses or change role mappings.
// Role names must exactly match Discord role names (case-sensitive).
// Run `pnpm scan:roles` to verify all configured role names exist in the server.

export interface EmployeeRoleEntry {
  /** Display label used in the management UI */
  label: string
  /** Exact Discord role name (case-sensitive, must match server exactly) */
  name: string
}

export interface EmployeeCustomRole extends EmployeeRoleEntry {
  /** When this role is assigned, also assign the base employee role if missing */
  autoGrantEmployee: boolean
  /** Minimum staff rank required to assign or remove this custom role */
  minRankToAssign: 'manager' | 'owner'
}

export interface EmployeeBusinessConfig {
  /** Should match the slug in businesses.config.ts where applicable */
  slug: string
  /** Display name shown in embeds and menus */
  name: string
  roles: {
    /** Base role assigned when hiring someone — "Add Employee" always assigns this */
    employee: EmployeeRoleEntry
    manager: EmployeeRoleEntry
    owner: EmployeeRoleEntry
    /**
     * Additional assignable roles shown as a separate select menu.
     * Assigning these does NOT replace the base employee role.
     */
    custom: EmployeeCustomRole[]
  }
  permissions: {
    /** Can managers promote employees to manager? Default: false */
    managersCanPromote: boolean
    /** Can managers assign/remove custom roles? Default: true */
    managersCanAssignCustomRoles: boolean
    /** Can owners add, remove, or demote other owners? Default: true */
    ownersCanManageOwners: boolean
    /**
     * When promoting to manager or owner, also ensure the base employee role is assigned.
     * When demoting (not firing), the employee role is always preserved.
     */
    higherRolesAutoGrantEmployee: boolean
  }
}

export const EMPLOYEE_BUSINESSES: EmployeeBusinessConfig[] = [
  {
    slug: 'mckenzie',
    name: 'McKenzie Enterprises',
    roles: {
      employee: { label: 'Employee', name: 'MKE Employee' },
      manager: { label: 'Manager', name: 'MKE Manager' },
      owner: { label: 'Owner', name: 'McKenzie Enterprises' },
      custom: [
        {
          label: 'MKE Assistant',
          name: 'MKE Assistant',
          autoGrantEmployee: true,
          minRankToAssign: 'manager',
        },
        {
          label: 'Printing Press Operator',
          name: 'Printing Press Operator',
          autoGrantEmployee: true,
          minRankToAssign: 'manager',
        },
      ],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: true,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: true,
    },
  },
  {
    slug: 'original-clothing',
    name: 'Original Clothing',
    roles: {
      employee: { label: 'Employee', name: 'OC Employee' },
      manager: { label: 'Manager', name: 'Original Clothing Manager' },
      owner: { label: 'Owner', name: 'Original Clothing' },
      custom: [
        {
          label: 'OC Supervisor',
          name: 'OC Supervisor',
          autoGrantEmployee: true,
          minRankToAssign: 'manager',
        },
        {
          label: 'OC Admin Assistant',
          name: 'OC Admin Assistant',
          autoGrantEmployee: true,
          minRankToAssign: 'manager',
        },
      ],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: true,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: true,
    },
  },
  {
    slug: 'caked-up',
    name: 'Caked Up',
    roles: {
      employee: { label: 'Employee', name: 'Caked Up Employee' },
      manager: { label: 'Manager', name: 'Caked Up Manager' },
      owner: { label: 'Owner', name: 'Caked Up' },
      custom: [],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: false,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: true,
    },
  },
  {
    slug: 'xtra',
    name: 'Xtra',
    roles: {
      // Role names use the old Discord names — update if the server roles are renamed.
      employee: { label: 'Employee', name: 'EXTRA Employee' },
      manager: { label: 'Manager', name: 'Extra Manager' },
      owner: { label: 'Owner', name: 'EXTRA Event Decor' },
      custom: [],
    },
    permissions: {
      managersCanPromote: false,
      managersCanAssignCustomRoles: false,
      ownersCanManageOwners: true,
      higherRolesAutoGrantEmployee: true,
    },
  },
]

export function getEmployeeConfig(slug: string): EmployeeBusinessConfig | undefined {
  return EMPLOYEE_BUSINESSES.find((b) => b.slug === slug)
}
