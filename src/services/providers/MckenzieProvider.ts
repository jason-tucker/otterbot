import { env } from '../../config/env'
import type { Character, Business } from '../../types/domain'
import type { IBusinessProvider, BusinessRoster, RosterMember, ApiNote } from './IBusinessProvider'

interface MkCharacterProfile {
  id: string
  status: boolean
  userId: string
  name: string
  csn: string
  dob: string | null
  phoneNumber: string
  bankNumber: string
  created: string
}

interface MkBusinessAccount {
  id: string
  status: boolean
  name: string
  owner: MkCharacterProfile
  employees: MkCharacterProfile[]
}


export class MckenzieProvider implements IBusinessProvider {
  private readonly baseUrl = env.EUPHORIC_API_BASE_URL
  private readonly apiKey = env.EUPHORIC_API_KEY
  private readonly apiBusinessName: string

  constructor(business: Business) {
    this.apiBusinessName =
      (business.settings?.apiBusinessName as string | undefined) ?? business.name
  }

  private headers() {
    return { 'EUPHORIC-API-KEY': this.apiKey }
  }

  // Character profiles endpoint returns a raw array (no wrapper)
  async lookupByDiscordId(discordId: string): Promise<Character[]> {
    const res = await fetch(
      `${this.baseUrl}/character-profiles/discord/${encodeURIComponent(discordId)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(8000) }
    )

    if (!res.ok) return []

    const data = await res.json() as MkCharacterProfile[]
    if (!Array.isArray(data)) return []

    return data
      .filter((p) => p.status)
      .map(MckenzieProvider.mapToCharacter)
  }

  async lookupByName(_name: string): Promise<Character[]> {
    return []
  }

  async getBusinessRoster(): Promise<BusinessRoster | null> {
    return MckenzieProvider.fetchRosterByName(this.apiBusinessName, this.headers())
  }

  static async findByName(name: string): Promise<BusinessRoster | null> {
    const headers = { 'EUPHORIC-API-KEY': env.EUPHORIC_API_KEY }
    return MckenzieProvider.fetchRosterByName(name, headers)
  }

  private static async fetchRosterByName(
    name: string,
    headers: Record<string, string>
  ): Promise<BusinessRoster | null> {
    const url = `${env.EUPHORIC_API_BASE_URL}/business-accounts/find?name=${encodeURIComponent(name)}`
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })

    if (!res.ok) return null

    const data = await res.json() as MkBusinessAccount
    if (!data?.id) return null

    const { owner, employees, name: businessName } = data

    const members: RosterMember[] = []

    if (owner?.status) {
      members.push({ id: owner.id, name: owner.name, csn: owner.csn || null, role: 'owner', discordId: owner.userId || null, character: MckenzieProvider.mapToCharacter(owner) })
    }

    for (const emp of employees ?? []) {
      if (emp.status) {
        members.push({ id: emp.id, name: emp.name, csn: emp.csn || null, role: 'employee', discordId: emp.userId || null, character: MckenzieProvider.mapToCharacter(emp) })
      }
    }

    return {
      businessName,
      ownerName: owner?.name ?? null,
      members,
    }
  }

  /**
   * Fetch markers (notes / warnings / standings) for a character by CSN.
   * The MKE API exposes these via /character-profiles/csn/{csn}/markers.
   * Found by mining the SPA bundle for `character-profiles/markers/...`
   * action names and probing CSN-based sub-resources.
   */
  async getNotes(csn: string): Promise<ApiNote[]> {
    const url = `${this.baseUrl}/character-profiles/csn/${encodeURIComponent(csn)}/markers`
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(`[MKE] getNotes ${res.status} ${url} body=${body.slice(0, 200)}`)
        return []
      }
      const data = await res.json()
      if (!Array.isArray(data)) {
        console.warn(`[MKE] getNotes returned non-array:`, data)
        return []
      }
      // Defensive: tolerate either the legacy ApiNote shape (id/content/created/employeeId/profileId)
      // or any shape with at least content + created. Unknown fields pass through.
      return data as ApiNote[]
    } catch (err) {
      console.warn(`[MKE] getNotes fetch failed:`, err)
      return []
    }
  }

  private static mapToCharacter(profile: MkCharacterProfile): Character {
    return {
      id: profile.id,
      name: profile.name,
      csn: profile.csn || null,
      dob: profile.dob,
      phoneNumber: profile.phoneNumber || null,
      bankNumber: profile.bankNumber || null,
      discordId: null,
      securityRiskLevel: 0,
      securityRiskInfo: null,
      source: 'mckenzie_api',
    }
  }
}
