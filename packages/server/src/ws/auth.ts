import type { IncomingMessage } from 'node:http';
import * as profilesDb from '../db/profiles.js';

export interface AuthenticatedUser {
  profileId: string;
  name: string;
}

/**
 * Verify the session token from the WebSocket upgrade request.
 *
 * For V1 (name-only auth with Auth.js JWT), the client passes the session
 * token as a query parameter or cookie. We decode and verify it to get
 * the player's profile ID.
 *
 * V1 approach: the client sends profileId + name as query params on the
 * WebSocket URL. We verify the profile exists in the database.
 * This will be upgraded to JWT verification when Auth.js shares its secret.
 */
export async function authenticateUpgrade(request: IncomingMessage): Promise<AuthenticatedUser | null> {
  const url = new URL(request.url ?? '', `http://${request.headers.host}`);
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
