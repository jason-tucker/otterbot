// Edit this file to add/remove businesses or change role → rank mappings.
// Use the exact role names as they appear in Discord (case-sensitive).
// Run `pnpm db:seed` after any changes to sync to the database.

export type BusinessProviderType = 'mckenzie' | 'discord-only'
export type StaffRank = 'employee' | 'manager' | 'owner'

export interface RoleMapping {
  name: string   // Exact Discord role name
  rank: StaffRank
}

export interface BusinessConfig {
  name: string
  slug: string
  providerType: BusinessProviderType
  settings?: Record<string, unknown>
  roles: RoleMapping[]
}

export const BUSINESSES: BusinessConfig[] = [
  {
    name: 'McKenzie Enterprises',
    slug: 'mckenzie',
    providerType: 'mckenzie',
    settings: { apiBusinessName: 'McKenzie Enterprises' },
    roles: [
      { name: 'McKenzie Enterprises', rank: 'owner' },
      { name: 'MKE Manager', rank: 'manager' },
      { name: 'Printing Press Operator', rank: 'employee' },
      { name: 'MKE Employee', rank: 'employee' },
      { name: 'MKE Assistant', rank: 'employee' },
    ],
  },
  {
    name: 'Original Clothing',
    slug: 'original-clothing',
    providerType: 'discord-only',
    roles: [
      { name: 'Original Clothing', rank: 'owner' },
      { name: 'Original Clothing Manager', rank: 'manager' },
      { name: 'OC Supervisor', rank: 'employee' },
      { name: 'OC Employee', rank: 'employee' },
      { name: 'OC Admin Assistant', rank: 'employee' },
    ],
  },
  {
    name: 'Backside Skateboards',
    slug: 'backside-skateboards',
    providerType: 'discord-only',
    roles: [
      { name: 'Backside Skateboards', rank: 'owner' },
      { name: 'Backside Skateboards Manager', rank: 'manager' },
      { name: 'Backside Designer', rank: 'employee' },
    ],
  },
  {
    name: 'EXTRA Event Decor',
    slug: 'extra-event-decor',
    providerType: 'discord-only',
    roles: [
      { name: 'EXTRA Event Decor', rank: 'owner' },
      { name: 'Extra Manager', rank: 'manager' },
      { name: 'EXTRA Employee', rank: 'employee' },
    ],
  },
  {
    name: 'Caked Up',
    slug: 'caked-up',
    providerType: 'discord-only',
    roles: [
      { name: 'Caked Up', rank: 'owner' },
      { name: 'Caked Up Manager', rank: 'manager' },
      { name: 'Caked Up Employee', rank: 'employee' },
    ],
  },
]
