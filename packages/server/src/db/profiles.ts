import { sql } from './client.js';

export interface PlayerProfile {
  id: string;
  name: string;
  avatar: string | null;
  createdAt: string;
}

export async function createProfile(name: string, avatar?: string): Promise<PlayerProfile> {
  const rows = await sql`
    INSERT INTO player_profiles (name, avatar)
    VALUES (${name}, ${avatar ?? null})
    RETURNING *
  `;
  return mapProfile(rows[0]);
}

export async function getProfileById(id: string): Promise<PlayerProfile | null> {
  const rows = await sql`SELECT * FROM player_profiles WHERE id = ${id}`;
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function getProfileByName(name: string): Promise<PlayerProfile | null> {
  const rows = await sql`SELECT * FROM player_profiles WHERE name = ${name} LIMIT 1`;
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function updateProfile(id: string, name: string, avatar?: string): Promise<PlayerProfile> {
  const rows = await sql`
    UPDATE player_profiles SET name = ${name}, avatar = ${avatar ?? null}
    WHERE id = ${id} RETURNING *
  `;
  return mapProfile(rows[0]);
}

function mapProfile(row: Record<string, unknown>): PlayerProfile {
  return {
    id: row.id as string,
    name: row.name as string,
    avatar: row.avatar as string | null,
    createdAt: row.created_at as string,
  };
}
