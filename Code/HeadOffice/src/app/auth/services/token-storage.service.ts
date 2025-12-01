import { Injectable } from '@angular/core';
import { environment } from '@env/environment';
import { Store } from '@ngrx/store';
import * as AuthSelectors from '@app/@core/store/auth/auth.selectors';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class TokenStorageService {
  // Use environment configuration keys
  private readonly ACCESS_TOKEN_KEY = environment.settings.auth.accessTokenKey;
  private readonly REFRESH_TOKEN_KEY = environment.settings.auth.refreshTokenKey;
  private readonly TOKEN_EXPIRES_KEY = environment.settings.auth.tokenExpiresKey;

  constructor(private store: Store) {}

  // We only store token-related data in localStorage for security

  setAccessToken(token: string): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
  }

  setRefreshToken(token: string): void {
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }

  setTokenExpires(expiresAt: number): void {
    localStorage.setItem(this.TOKEN_EXPIRES_KEY, expiresAt.toString());
  }

  getAccessToken(): string | null {
    // First try from store for better performance
    let token: string | null = null;
    this.store
      .select(AuthSelectors.selectAccessToken)
      .pipe(take(1))
      .subscribe((storeToken) => {
        token = storeToken;
      });

    // If not in store, try from localStorage
    if (!token) {
      token = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    }

    return token;
  }

  getRefreshToken(): string | null {
    // First try from store for better performance
    let token: string | null = null;
    this.store
      .select(AuthSelectors.selectRefreshToken)
      .pipe(take(1))
      .subscribe((storeToken) => {
        token = storeToken;
      });

    // If not in store, try from localStorage
    if (!token) {
      token = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    }

    return token;
  }

  getTokenExpires(): number | null {
    // First try from store for better performance
    let expiresAt: number | null = null;
    this.store
      .select(AuthSelectors.selectTokenExpires)
      .pipe(take(1))
      .subscribe((storeExpires) => {
        expiresAt = storeExpires;
      });

    // If not in store, try from localStorage
    if (!expiresAt) {
      const expiresAtStr = localStorage.getItem(this.TOKEN_EXPIRES_KEY);
      expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : null;
    }

    return expiresAt;
  }

  isTokenExpired(): boolean {
    const expiresAt = this.getTokenExpires();
    if (!expiresAt) return true;

    // Current time in milliseconds since epoch
    const now = Date.now();

    // Return true if token is expired
    return now >= expiresAt;
  }

  clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_EXPIRES_KEY);
  }
}
