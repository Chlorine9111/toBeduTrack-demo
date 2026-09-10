export type AnnouncementTargetType = "global" | "school"

export type Announcement = {
  id: string
  title: string
  content: string
  targetType: AnnouncementTargetType
  targetSchools: string[]
  isActive: boolean
  startsAt: string
  expiresAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type AnnouncementListResponse = {
  items: Announcement[]
  total: number
}

export type CreateAnnouncementPayload = {
  title: string
  content?: string
  targetType: AnnouncementTargetType
  targetSchools?: string[]
  startsAt?: string
  expiresAt?: string | null
}

export type ActiveAnnouncementForUser = Announcement & {
  dismissed: boolean
}

export function mapRowToAnnouncement(row: Record<string, unknown>): Announcement {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    targetType: (row.target_type as AnnouncementTargetType) ?? "global",
    targetSchools: (row.target_schools as string[]) ?? [],
    isActive: Boolean(row.is_active),
    startsAt: String(row.starts_at ?? row.created_at ?? ""),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  }
}
