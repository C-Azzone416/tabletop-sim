import * as profilesDb from '../db/profiles.js';

export interface AuthenticatedUser {
  profileId: string;
  name: string;
}

/**
 * Verify a profileId + name credential against the database.
 *
 * V1 approach, shared by the WS upgrade handler and the REST routes below:
 * the client sends profileId + name, and we verify the profile exists and
 * the name matches (prevents spoofing another profile). This will be
 * upgraded to JWT verification when Auth.js shares its secret.
 */
export async function authenticateProfile(profileId: string | null | undefined, name: string | null | undefined): Promise<AuthenticatedUser | null> {
  if (!profileId || !name) {
    return null;
  }

  const profile = await profilesDb.getProfileById(profileId);
  if (!profile) {
    return null;
  }

  if (profile.name !== name) {
    return null;
  }

  return { profileId: profile.id, name: profile.name };
}

/**
 * Verify the session from the WebSocket upgrade request.
 *
 * V1 approach: the client sends profileId + name as query params on the
 * WebSocket URL. We verify the profile exists in the database.
 */
export async function authenticateUpgrade(request: { url?: string; headers: Record<string, string | string[] | undefined> }): Promise<AuthenticatedUser | null> {
  const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
  const url = new URL(request.url ?? '', `http://${host}`);
  return authenticateProfile(url.searchParams.get('profileId'), url.searchParams.get('name'));
}
