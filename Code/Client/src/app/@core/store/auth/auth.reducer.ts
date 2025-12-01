import { createReducer, on } from '@ngrx/store';
import * as AuthActions from './auth.actions';
import { initialAuthState, AuthState } from './auth.model';

// Add this line to re-export the AuthState interface
export type { AuthState } from './auth.model';

export const authReducer = createReducer(
  initialAuthState,

  // Login
  on(AuthActions.login, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(AuthActions.loginSuccess, (state, { user, accessToken, refreshToken, tokenExpires }) => ({
    ...state,
    isAuthenticated: true,
    loading: false,
    user,
    accessToken,
    refreshToken,
    tokenExpires,
  })),

  on(AuthActions.loginFailure, (state, { error }) => ({
    ...state,
    isAuthenticated: false,
    loading: false,
    error,
  })),

  // Logout
  on(AuthActions.logout, (state) => ({ ...state, loading: true })),

  on(AuthActions.logoutSuccess, () => ({
    ...initialAuthState,
  })),

  on(AuthActions.logoutFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // Token refresh
  on(AuthActions.refreshToken, (state) => ({ ...state, loading: true })),

  on(AuthActions.refreshTokenSuccess, (state, { accessToken, refreshToken, tokenExpires }) => ({
    ...state,
    loading: false,
    accessToken,
    refreshToken,
    tokenExpires,
  })),

  on(AuthActions.refreshTokenFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  // User data
  on(AuthActions.updateUser, (state, { user }) => ({
    ...state,
    user,
  })),

  on(AuthActions.loadUserSuccess, (state, { user }) => ({
    ...state,
    user,
  })),
);
