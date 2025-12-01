// Auth state model
export interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  // Only store non-sensitive data
  user: UserState | null;
  // Keep the access tokens minimal
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpires: number | null;
}

export interface UserState {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export const initialAuthState: AuthState = {
  isAuthenticated: false,
  loading: false,
  error: null,
  user: null,
  accessToken: null,
  refreshToken: null,
  tokenExpires: null,
};
