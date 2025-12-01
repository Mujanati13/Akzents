import { Injectable } from '@angular/core';
import { Credentials } from '@core/entities';
import { TokenStorageService } from './token-storage.service';

/**
 * Provides in-memory storage for authentication credentials.
 * No user data is stored in browser storage for security.
 */
@Injectable({
  providedIn: 'root',
})
export class CredentialsService {
  private _credentials: Credentials | null = null;

  constructor(private tokenStorageService: TokenStorageService) {
    // We no longer load credentials from storage
  }

  /**
   * Gets the user credentials.
   * @return The user credentials or null if the user is not authenticated.
   */
  get credentials(): Credentials | null {
    return this._credentials;
  }

  /**
   * Checks is the user is authenticated.
   * @return True if the user is authenticated.
   */
  isAuthenticated(): boolean {
    return !!this._credentials && !!this.tokenStorageService.getAccessToken();
  }

  /**
   * Sets the user credentials in memory only.
   * Only tokens are persisted in browser storage.
   * @param credentials The user credentials.
   */
  setCredentials(credentials?: Credentials) {
    this._credentials = credentials || null;

    if (credentials) {
      // Store only tokens in browser storage through the token service
      this.tokenStorageService.setAccessToken(credentials.token);
      if (credentials.refreshToken) {
        this.tokenStorageService.setRefreshToken(credentials.refreshToken);
      }
      if (credentials.expiresIn) {
        this.tokenStorageService.setTokenExpires(credentials.expiresIn);
      }
    } else {
      // Clear tokens on logout
      this.tokenStorageService.clearTokens();
    }
  }
}
