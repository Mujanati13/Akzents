import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, switchMap, catchError, map } from 'rxjs/operators';

import { environment } from '@env/environment';
import { TokenStorageService } from './token-storage.service';
import { CredentialsService } from './credentials.service';
import { Credentials } from '@core/entities';
import { ROLE } from '../enums/roles.enum';
import { InitializerService } from '@app/core/services/initializer.service';
import { AuthStateService, AuthState } from './auth-state.service';

export interface LoginContext {
  username: string;
  password: string;
  remember?: boolean;
  isMobile?: boolean;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  tokenExpires: number;
  user: {
    id: number;
    email: string;
    provider: string;
    socialId: string;
    firstName: string;
    lastName: string;
    photo: {
      id: string;
      path: string;
    };
    role: {
      id: number;
      name: string;
    };
    status: {
      id: number;
      name: string;
    };
    createdAt: string;
    updatedAt: string;
    deletedAt: string;
  };
}

/**
 * Provides authentication workflow with API integration.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  private readonly apiUrl = environment.apiUrl;

  constructor(
    private readonly _http: HttpClient,
    private readonly _tokenStorageService: TokenStorageService,
    private readonly _credentialsService: CredentialsService,
    private readonly _initializerService: InitializerService,
    private readonly _authStateService: AuthStateService, // Add this dependency
  ) {}

  /**
   * Authenticates the user with the API.
   * @param context The login parameters.
   * @return The user credentials.
   */
  login(context: LoginContext): Observable<Credentials> {
    return this._http
      .post<LoginResponse>(`${this.apiUrl}/auth/client/login`, {
        email: context.username,
        password: context.password,
      })
      .pipe(
        tap((response) => {
          // Store ONLY tokens and expiration in session storage
          this._tokenStorageService.setAccessToken(response.token);
          this._tokenStorageService.setRefreshToken(response.refreshToken);
          this._tokenStorageService.setTokenExpires(response.tokenExpires);
        }),
        // Load initial data immediately after storing tokens
        switchMap((response) => {
          // Use the initializer service to get complete user profile
          return this._initializerService.loadInitialAppData().pipe(
            map((initialData) => {
              if (!initialData) {
                throw new Error('Failed to load user data');
              }

              // Map roles from API response
              const roleMapping = {
                admin: ROLE.ADMIN,
                user: ROLE.USER,
                member: ROLE.MEMBER,
                guest: ROLE.GUEST,
              };

              const user = initialData.user;
              const roleName = user.role?.name || 'guest';
              const mappedRole = roleMapping[roleName.toLowerCase()] || ROLE.GUEST;

              // Create credentials object for memory storage only
              const credentials = new Credentials({
                id: user.id,
                username: user.email,
                token: response.token,
                refreshToken: response.refreshToken,
                expiresIn: response.tokenExpires,
                roles: [mappedRole],
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
              });

              // Store credentials in memory only
              this._credentialsService.setCredentials(credentials);

              // Explicitly set auth state to AUTHENTICATED (add this line)
              this._authStateService.setAuthState(AuthState.AUTHENTICATED);

              return credentials;
            }),
            catchError((err) => {
              console.error('Failed to load initial data after login:', err);
              // If initializer fails, we still try to create credentials from login response
              return this.createCredentialsFromLoginResponse(response);
            }),
          );
        }),
        catchError((error) => {
          console.error('Login error:', error);
          // Clear any tokens that might have been set
          this._tokenStorageService.clearTokens();

          // Make sure auth state is set to NOT_AUTHENTICATED (add this line)
          this._authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);

          return throwError(() => new Error('Login failed'));
        }),
      );
  }

  /**
   * Creates credentials from login response as fallback
   */
  private createCredentialsFromLoginResponse(response: LoginResponse): Observable<Credentials> {
    const roleMapping = {
      admin: ROLE.ADMIN,
      user: ROLE.USER,
      member: ROLE.MEMBER,
      guest: ROLE.GUEST,
    };

    // Ensure case-insensitive role mapping with debug logging
    const roleName = response.user.role?.name || 'guest';
    console.log(`Mapping role name: ${roleName}`);
    const mappedRole = roleMapping[roleName.toLowerCase()] || ROLE.GUEST;
    console.log(`Mapped to enum: ${mappedRole}`);

    const credentials = new Credentials({
      id: response.user.id,
      username: response.user.email,
      token: response.token,
      refreshToken: response.refreshToken,
      expiresIn: response.tokenExpires,
      roles: [mappedRole],
      email: response.user.email,
      firstName: response.user.firstName,
      lastName: response.user.lastName,
    });

    // Store credentials in memory only
    this._credentialsService.setCredentials(credentials);

    // Explicitly set auth state to AUTHENTICATED (add this line)
    this._authStateService.setAuthState(AuthState.AUTHENTICATED);

    return of(credentials);
  }

  /**
   * Refreshes the access token
   */
  refreshToken(): Observable<any> {
    const refreshToken = this._tokenStorageService.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${refreshToken}`,
    });

    return this._http.post<LoginResponse>(`${this.apiUrl}/auth/refresh`, {}, { headers }).pipe(
      tap((response) => {
        // Update tokens in session storage
        this._tokenStorageService.setAccessToken(response.token);
        this._tokenStorageService.setRefreshToken(response.refreshToken);
        this._tokenStorageService.setTokenExpires(response.tokenExpires);

        // If we have current credentials, update them with new token
        const currentCreds = this._credentialsService.credentials;
        if (currentCreds) {
          const updatedCreds = new Credentials({
            ...currentCreds,
            token: response.token,
            refreshToken: response.refreshToken,
            expiresIn: response.tokenExpires,
          });
          this._credentialsService.setCredentials(updatedCreds);
        }
      }),
      map((response) => ({
        token: response.token,
        refreshToken: response.refreshToken,
        tokenExpires: response.tokenExpires,
      })),
    );
  }

  /**
   * Logs out the user and clears credentials.
   * @return True if the user was logged out successfully.
   */
  logout(): Observable<boolean> {
    return this._http.post<void>(`${this.apiUrl}/auth/logout`, {}).pipe(
      tap(() => {
        this._tokenStorageService.clearTokens();
        this._credentialsService.setCredentials();
        // Set auth state to NOT_AUTHENTICATED
        this._authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);
      }),
      switchMap(() => of(true)),
      catchError(() => {
        // Even if the API call fails, clear tokens and consider logout successful
        this._tokenStorageService.clearTokens();
        this._credentialsService.setCredentials();
        this._authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);
        return of(true);
      }),
    );
  }
}
