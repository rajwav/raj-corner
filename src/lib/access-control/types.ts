export type Visibility = 'public' | 'private' | 'absolute_private';
export type AccessScope = 'page' | 'world' | 'site';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type UserRole = 'owner' | 'visitor';

export interface UserSession {
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  expiresAt: number;
}

export interface AccessRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  resourcePath: string; // e.g. /entry/that-evening-in-puri
  worldSlug?: string;   // e.g. travel
  requestedScope: AccessScope;
  note?: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface AccessGrant {
  id: string;
  userEmail: string;
  userName?: string;
  scope: AccessScope;
  target: string; // path (e.g. /entry/foo), world slug (e.g. travel), or '*' for site
  grantedBy: string;
  grantedAt: string;
  status: 'active' | 'revoked';
  revokedAt?: string;
}

export interface AccessEvaluation {
  allowed: boolean;
  visibility: Visibility;
  reason: 
    | 'public' 
    | 'owner' 
    | 'granted_page' 
    | 'granted_world' 
    | 'granted_site' 
    | 'unauthenticated' 
    | 'unauthorized_can_request' 
    | 'unauthorized_cannot_request' 
    | 'pending' 
    | 'rejected';
  requestId?: string;
  matchedScope?: AccessScope;
  allowRequests: boolean;
}

export interface PageVisibilityOverride {
  path: string; // e.g. /archive or /world/travel or /entry/ruposh
  visibility: Visibility;
  allowRequests?: boolean;
  updatedAt: string;
}
