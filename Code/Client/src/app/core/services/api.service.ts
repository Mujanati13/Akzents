import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpErrorResponse, HttpContext } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, EMPTY } from 'rxjs';
import { catchError, switchMap, filter, take, timeout, tap } from 'rxjs/operators';
import { environment } from '@env/environment';
import { TokenStorageService } from '@app/auth/services/token-storage.service';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { SKIP_API_PREFIX, SKIP_AUTH_CHECK } from '@app/@core/interceptors/api-prefix.interceptor';

interface ApiConfig {
  baseURL: string;
  timeout: number;
}

interface ErrorResponse {
  status?: number;
  message?: string;
  data?: any;
}

interface ApiRequestConfig {
  headers?: { [key: string]: string };
  params?: { [key: string]: any };
  skipAuth?: boolean;
  skipApiPrefix?: boolean;
  _retry?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly apiConfig: ApiConfig = {
    baseURL: environment.apiUrl,
    timeout: 30000,
  };

  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(
    private http: HttpClient,
    private tokenStorageService: TokenStorageService,
    private authService: AuthenticationService,
  ) {}

  /**
   * Get the current token from storage
   */
  private getToken(): string | null {
    return this.tokenStorageService.getAccessToken();
  }

  /**
   * Get the refresh token from storage
   */
  private getRefreshToken(): string | null {
    return this.tokenStorageService.getRefreshToken();
  }

  /**
   * Get the current language (from localStorage or fallback to 'en')
   */
  private getLanguage(): string {
    return localStorage.getItem('i18nextLng') || 'de';
  }

  /**
   * Build full URL with base URL if needed
   */
  private buildUrl(url: string, skipApiPrefix = false): string {
    // If URL is already absolute or we should skip API prefix, return as is
    if (url.startsWith('http') || skipApiPrefix) {
      return url;
    }

    // Remove leading slash if present to avoid double slashes
    const cleanUrl = url.startsWith('/') ? url.substring(1) : url;

    // Combine base URL with the endpoint
    return `${this.apiConfig.baseURL}/${cleanUrl}`;
  }

  /**
   * Create HTTP headers with Bearer token and language
   */
  private createHeaders(customHeaders: { [key: string]: string } = {}, skipAuth = false): HttpHeaders {
    let headers = new HttpHeaders(customHeaders);

    if (!skipAuth) {
      const token = this.getToken();
      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
      }
    }

    const language = this.getLanguage();
    headers = headers.set('x-custom-lang', language);

    return headers;
  }

  /**
   * Create HTTP context for interceptor configuration
   */
  private createContext(skipAuth = false, skipApiPrefix = false): HttpContext {
    let context = new HttpContext();

    if (skipAuth) {
      context = context.set(SKIP_AUTH_CHECK, true);
    }

    if (skipApiPrefix) {
      context = context.set(SKIP_API_PREFIX, true);
    }

    return context;
  }

  /**
   * Create HTTP params from object
   */
  private createParams(params: { [key: string]: any } = {}): HttpParams {
    let httpParams = new HttpParams();

    Object.keys(params).forEach((key) => {
      if (params[key] !== null && params[key] !== undefined) {
        httpParams = httpParams.set(key, params[key].toString());
      }
    });

    return httpParams;
  }

  /**
   * Handle HTTP errors and token refresh
   */
  private handleError = (error: HttpErrorResponse, config?: ApiRequestConfig): Observable<any> => {
    const errorResponse: ErrorResponse = {};

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorResponse.message = 'Client Error';
      errorResponse.data = error.error.message;
    } else {
      // Server-side error
      errorResponse.status = error.status;
      errorResponse.message = error.error?.message || 'Server Error';
      errorResponse.data = error.error;

      // Handle token expiration (401) and retry with refresh
      if (error.status === 401 && !config?._retry && !config?.skipAuth) {
        return this.handle401Error(config);
      }
    }

    return throwError(() => errorResponse);
  };

  /**
   * Handle 401 errors by refreshing token and retrying
   */
  private handle401Error(config?: ApiRequestConfig): Observable<any> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        // No refresh token available, redirect to login
        this.isRefreshing = false;
        return throwError(() => ({ status: 401, message: 'No refresh token available' }));
      }

      return this.authService.refreshToken().pipe(
        switchMap((tokenResponse: any) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(tokenResponse.token);

          // Mark as retry and return empty to signal retry should happen
          if (config) {
            config._retry = true;
          }
          return EMPTY;
        }),
        catchError((refreshError) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(null);

          // Refresh failed, clear tokens and redirect to login
          this.tokenStorageService.clearTokens();
          return throwError(() => ({ status: 401, message: 'Token refresh failed' }));
        }),
      );
    } else {
      // Wait for refresh to complete
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap(() => EMPTY), // Signal to retry
      );
    }
  }

  /**
   * Execute HTTP request with error handling and retry logic
   */
  private executeRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, data?: any, config: ApiRequestConfig = {}): Observable<T> {
    // Build the full URL using the base URL from apiConfig
    const fullUrl = this.buildUrl(url, config.skipApiPrefix);

    const headers = this.createHeaders(config.headers, config.skipAuth);
    const context = this.createContext(config.skipAuth, config.skipApiPrefix);
    const params = this.createParams(config.params);

    const requestOptions = {
      headers,
      context,
      params: method === 'GET' || method === 'DELETE' ? params : undefined,
      body: method !== 'GET' && method !== 'DELETE' ? data : undefined,
    };

    const request$ = this.http.request<T>(method, fullUrl, requestOptions);

    return request$.pipe(
      // Apply timeout from apiConfig
      timeout(this.apiConfig.timeout),
      catchError((error: HttpErrorResponse) => {
        const handledError$ = this.handleError(error, config);

        // If handleError returns EMPTY, it means we should retry
        return handledError$.pipe(
          switchMap(() => {
            // Retry the request with updated token
            const newHeaders = this.createHeaders(config.headers, config.skipAuth);
            const retryOptions = { ...requestOptions, headers: newHeaders };
            return this.http.request<T>(method, fullUrl, retryOptions).pipe(timeout(this.apiConfig.timeout));
          }),
        );
      }),
    );
  }

  /**
   * GET request with optional headers and query parameters
   */
  get<T>(url: string, params: any = {}, headers: any = {}, skipAuth = false, skipApiPrefix = false): Observable<T> {
    const config: ApiRequestConfig = { headers, params, skipAuth, skipApiPrefix };
    return this.executeRequest<T>('GET', url, undefined, config);
  }

  /**
   * POST request with optional headers
   */
  post<T>(url: string, data: any = {}, headers: any = {}, skipAuth = false, skipApiPrefix = false): Observable<T> {
    const config: ApiRequestConfig = { headers, skipAuth, skipApiPrefix };
    return this.executeRequest<T>('POST', url, data, config);
  }

  /**
   * POST request for file uploads - ensures no Content-Type header is set
   */
  postFile<T>(url: string, formData: FormData, skipAuth = false, skipApiPrefix = false): Observable<T> {
    // For file uploads, we need special handling to avoid any headers that might interfere
    // with multipart/form-data boundary

    console.log('🚀 ApiService.postFile called with:', {
      url,
      skipAuth,
      skipApiPrefix,
      baseURL: this.apiConfig.baseURL,
    });

    // Log FormData contents
    console.log('📝 FormData contents:');
    formData.forEach((value, key) => {
      if (value instanceof File) {
        console.log(`  ${key}: [File] ${value.name} (${value.size} bytes)`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

    // Build the full URL and log each step
    console.log('🔍 URL building process:');
    console.log('  - Original URL:', url);
    console.log('  - Starts with http?', url.startsWith('http'));
    console.log('  - Skip API prefix?', skipApiPrefix);

    const fullUrl = this.buildUrl(url, skipApiPrefix);
    console.log('📍 Final Full URL:', fullUrl);

    // Create minimal headers - only Authorization if needed
    let headers = new HttpHeaders();
    if (!skipAuth) {
      const token = this.getToken();
      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
        console.log('🔑 Added Authorization header');
      } else {
        console.log('⚠️ No token available');
      }
    }

    // Log final headers
    console.log(
      '📋 Request headers:',
      headers.keys().map((key) => `${key}: ${headers.get(key)}`),
    );

    // Create context for interceptors
    const context = this.createContext(skipAuth, skipApiPrefix);

    const requestOptions = {
      headers,
      context,
      body: formData,
    };

    console.log('📤 Making HTTP request to:', fullUrl);
    const request$ = this.http.request<T>('POST', fullUrl, requestOptions);

    return request$.pipe(
      // Apply timeout from apiConfig
      timeout(this.apiConfig.timeout),
      tap((response) => {
        console.log('✅ HTTP request successful:', response);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('❌ HTTP request failed:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url,
          error: error.error,
        });

        const handledError$ = this.handleError(error, { skipAuth, skipApiPrefix });

        // If handleError returns EMPTY, it means we should retry
        return handledError$.pipe(
          switchMap(() => {
            console.log('🔄 Retrying request with refreshed token...');
            // Retry the request with updated token
            let retryHeaders = new HttpHeaders();
            if (!skipAuth) {
              const newToken = this.getToken();
              if (newToken) {
                retryHeaders = retryHeaders.set('Authorization', `Bearer ${newToken}`);
              }
            }

            const retryOptions = { ...requestOptions, headers: retryHeaders };
            return this.http.request<T>('POST', fullUrl, retryOptions).pipe(timeout(this.apiConfig.timeout));
          }),
        );
      }),
    );
  }

  /**
   * PATCH request for file uploads - ensures no Content-Type header is set
   */
  patchFile<T>(url: string, formData: FormData, skipAuth = false, skipApiPrefix = false): Observable<T> {
    // For file uploads, we need special handling to avoid any headers that might interfere
    // with multipart/form-data boundary

    console.log('🚀 ApiService.postFile called with:', {
      url,
      skipAuth,
      skipApiPrefix,
      baseURL: this.apiConfig.baseURL,
    });

    // Log FormData contents
    console.log('📝 FormData contents:');
    formData.forEach((value, key) => {
      if (value instanceof File) {
        console.log(`  ${key}: [File] ${value.name} (${value.size} bytes)`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

    // Build the full URL and log each step
    console.log('🔍 URL building process:');
    console.log('  - Original URL:', url);
    console.log('  - Starts with http?', url.startsWith('http'));
    console.log('  - Skip API prefix?', skipApiPrefix);

    const fullUrl = this.buildUrl(url, skipApiPrefix);
    console.log('📍 Final Full URL:', fullUrl);

    // Create minimal headers - only Authorization if needed
    let headers = new HttpHeaders();
    if (!skipAuth) {
      const token = this.getToken();
      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
        console.log('🔑 Added Authorization header');
      } else {
        console.log('⚠️ No token available');
      }
    }

    // Log final headers
    console.log(
      '📋 Request headers:',
      headers.keys().map((key) => `${key}: ${headers.get(key)}`),
    );

    // Create context for interceptors
    const context = this.createContext(skipAuth, skipApiPrefix);

    const requestOptions = {
      headers,
      context,
      body: formData,
    };

    console.log('📤 Making HTTP request to:', fullUrl);
    const request$ = this.http.request<T>('PATCH', fullUrl, requestOptions);

    return request$.pipe(
      // Apply timeout from apiConfig
      timeout(this.apiConfig.timeout),
      tap((response) => {
        console.log('✅ HTTP request successful:', response);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('❌ HTTP request failed:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url,
          error: error.error,
        });

        const handledError$ = this.handleError(error, { skipAuth, skipApiPrefix });

        // If handleError returns EMPTY, it means we should retry
        return handledError$.pipe(
          switchMap(() => {
            console.log('🔄 Retrying request with refreshed token...');
            // Retry the request with updated token
            let retryHeaders = new HttpHeaders();
            if (!skipAuth) {
              const newToken = this.getToken();
              if (newToken) {
                retryHeaders = retryHeaders.set('Authorization', `Bearer ${newToken}`);
              }
            }

            const retryOptions = { ...requestOptions, headers: retryHeaders };
            return this.http.request<T>('POST', fullUrl, retryOptions).pipe(timeout(this.apiConfig.timeout));
          }),
        );
      }),
    );
  }
  /**
   * PUT request with optional headers
   */
  put<T>(url: string, data: any = {}, headers: any = {}, skipAuth = false, skipApiPrefix = false): Observable<T> {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };
    const config: ApiRequestConfig = { headers: defaultHeaders, skipAuth, skipApiPrefix };
    return this.executeRequest<T>('PUT', url, data, config);
  }

  /**
   * PATCH request with optional headers
   */
  patch<T>(url: string, data: any = {}, headers: any = {}, skipAuth = false, skipApiPrefix = false): Observable<T> {
    const config: ApiRequestConfig = { headers, skipAuth, skipApiPrefix };
    return this.executeRequest<T>('PATCH', url, data, config);
  }

  /**
   * DELETE request with optional headers and query parameters
   */
  delete<T>(url: string, params: any = {}, headers: any = {}, skipAuth = false, skipApiPrefix = false): Observable<T> {
    const config: ApiRequestConfig = { headers, params, skipAuth, skipApiPrefix };
    return this.executeRequest<T>('DELETE', url, undefined, config);
  }

  /**
   * GET request that returns a Blob (for file downloads)
   */
  getBlob(url: string, params: any = {}, headers: any = {}, skipAuth = false, skipApiPrefix = false): Observable<Blob> {
    const fullUrl = this.buildUrl(url, skipApiPrefix);

    const httpHeaders = this.createHeaders(headers, skipAuth);
    const context = this.createContext(skipAuth, skipApiPrefix);
    const httpParams = this.createParams(params);

    const requestOptions = {
      headers: httpHeaders,
      context,
      params: httpParams,
      responseType: 'blob' as 'blob',
    };

    return this.http.get(fullUrl, requestOptions).pipe(
      timeout(this.apiConfig.timeout),
      catchError((error: HttpErrorResponse) => {
        const handledError$ = this.handleError(error, { headers, params, skipAuth, skipApiPrefix });

        return handledError$.pipe(
          switchMap(() => {
            const newHeaders = this.createHeaders(headers, skipAuth);
            const retryOptions = { ...requestOptions, headers: newHeaders };
            return this.http.get(fullUrl, retryOptions).pipe(timeout(this.apiConfig.timeout));
          }),
        );
      }),
    );
  }
}
