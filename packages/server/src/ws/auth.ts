import * as profilesDb from '../db/profiles.js';

export interface AuthenticatedUser {
  profileId: string;
  name: string;
}

/**
 * Verify the session from the WebSocket upgrade request.
 *
 * V1 approach: the client sends profileId + name as query params on the
 * WebSocket URL. We verify the profile exists in the database.
 * This will be upgraded to JWT verification when Auth.js shares its secret.
 */
export async function authenticateUpgrade(request: { url?: string; headers: Record<string, string | string[] | undefined> }): Promise<AuthenticatedUser | null> {
  const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
  const url = new URL(request.url ?? '', `http://${host}`);
  const profileId = url.searchParams.get('profileId');
  const name = url.searchParams.get('name');

  if (!profileId || !name) {
    return null;
  }

  // Verify profile exists in database
  const profile = await profilesDb.getProfileById(profileId);
  if (!profile) {
    return null;
  }

  // Verify name matches (prevents spoofing another profile)
  if (profile.name !== name) {
    return null;
  }

  return { profileId: profile.id, name: profile.name };
}
