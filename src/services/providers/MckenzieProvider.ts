import { env } from '../../config/env'
import type { Character, Business } from '../../types/domain'
import type { IBusinessProvider, BusinessRoster, RosterMember, ApiNote, CreateMarkerResult, CharacterWithBusinesses } from './IBusinessProvider'

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
  __businessAccounts__?: string[]
  __has_businessAccounts__?: boolean
}

interface MkBusinessAccount {
  id: string
  status: boolean
  name: string
  owner: MkCharacterProfile
  employees: MkCharacterProfile[]
}


/**
 * Map an HTTP status to a generic error category. Avoids exposing MKE
 * response bodies — which can contain PII for the affected character — in
 * any user-facing string or log line.
 */
function errorCategoryFromStatus(status: number): string {
  if (status === 401 || status === 403) return 'authentication / permission'
  if (status === 404) return 'not found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'upstream error'
  return `http ${status}`
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
        // Don't log the response body — MKE error payloads can echo back
        // PII (CSN / phone / bank fields) and journald retains otterbot logs.
        // Status + URL is enough to triage without exposing PII.
        console.warn(`[MKE] getNotes ${res.status} ${url}`)
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

  async getCharacterByCsn(csn: string): Promise<CharacterWithBusinesses | null> {
    const url = `${this.baseUrl}/character-profiles/csn/${encodeURIComponent(csn)}`
    try {
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(8000) })
      if (!res.ok) return null
      const profile = await res.json() as MkCharacterProfile
      if (!profile?.id) return null
      const character = MckenzieProvider.mapToCharacter(profile)
      return {
        ...character,
        businessAccountIds: Array.isArray(profile.__businessAccounts__) ? profile.__businessAccounts__ : [],
        hasBusinessAccounts: profile.__has_businessAccounts__ === true,
      }
    } catch (err) {
      console.warn(`[MKE] getCharacterByCsn fetch failed:`, err)
      return null
    }
  }

  async createMarker(csn: string, type: number, content: string, employeeDiscordId: string): Promise<CreateMarkerResult> {
    const url = `${this.baseUrl}/character-profiles/csn/${encodeURIComponent(csn)}/markers`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeDiscordId, type, content }),
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text().catch(() => '')
      if (!res.ok) {
        // Sanitize the error: surface only a category to the caller so
        // downstream user-facing strings never carry MKE PII. Full body is
        // not retained anywhere.
        return { ok: false, status: res.status, error: errorCategoryFromStatus(res.status) }
      }
      let marker: ApiNote | undefined
      try { marker = text ? JSON.parse(text) as ApiNote : undefined } catch { /* non-JSON success */ }
      return { ok: true, marker }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
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
