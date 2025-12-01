import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, take, switchMap, finalize } from 'rxjs/operators';
import { TokenStorageService } from '../services/token-storage.service';
import { AuthenticationService } from '../services/authentication.service';
import { Router } from '@angular/router';
import { CredentialsService } from '../services/credentials.service';
import { AuthStateService, AuthState } from '../services/auth-state.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(
    private tokenService: TokenStorageService,
    private authService: AuthenticationService,
    private router: Router,
    private credentialsService: CredentialsService,
    private authStateService: AuthStateService,
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip adding token for authentication endpoints
    if (this.isAuthRequest(request)) {
      return next.handle(request);
    }

    // Get token and check if it's expired
    const token = this.tokenService.getAccessToken();

    if (token) {
      // Check if token is expired
      if (this.tokenService.isTokenExpired()) {
        return this.handle401Error(request, next);
      }

      // Add token to request if it's not expired
      request = this.addTokenHeader(request, token);
    }

    return next.handle(request).pipe(
      catchError((error) => {
        if (error instanceof HttpErrorResponse) {
          // Handle 401 Unauthorized errors
          if (error.status === 401) {
            return this.handle401Error(request, next);
          }

          // Handle 403 Forbidden errors
          if (error.status === 403) {
            this.clearAuthAndRedirect();
            return throwError(() => error);
          }
        }
        return throwError(() => error);
      }),
    );
  }

  private isAuthRequest(request: HttpRequest<any>): boolean {
    return request.url.includes('/auth/login') || request.url.includes('/auth/refresh');
  }

  private addTokenHeader(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      headers: request.headers.set('Authorization', `Bearer ${token}`),
    });
  }

  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = this.tokenService.getRefreshToken();
      if (!refreshToken) {
        // No refresh token available, clear auth and redirect
        this.clearAuthAndRedirect();
        return throwError(() => new Error('No refresh token available'));
      }

      // Try to refresh token
      return this.authService.refreshToken().pipe(
        switchMap((response) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(response.token);

          return next.handle(this.addTokenHeader(request, response.token));
        }),
        catchError((error) => {
          this.isRefreshing = false;
          // Handle refresh failure - clear auth and redirect
          this.clearAuthAndRedirect();
          return throwError(() => error);
        }),
        finalize(() => {
          this.isRefreshing = false;
        }),
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap((token) => next.handle(this.addTokenHeader(request, token))),
      );
    }
  }

  private clearAuthAndRedirect(): void {
    this.tokenService.clearTokens();
    this.credentialsService.setCredentials();
    this.authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);

    // Don't navigate directly, let the shell component handle it
    // The navigation will happen based on the auth state change
  }
}
