import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of, tap } from 'rxjs';
import { environment } from '@env/environment';
import { SKIP_API_PREFIX, SKIP_AUTH_CHECK } from '@app/@core/interceptors/api-prefix.interceptor';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import * as AppDataActions from '@app/@core/store/app-data/app-data.actions';

export interface InitialDataUser {
  id: number;
  email: string;
  provider: string;
  socialId: string | null;
  firstName: string;
  lastName: string;
  role: {
    id: number;
    name: string;
    __entity: string;
  };
  status: {
    id: number;
    name: string;
    __entity: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ClientCompany {
  id: number;
  logo: {
    id: string;
    path: string;
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignedProject {
  id: string;
  name: string;
  slug: string;
  clientId: string;
  clientName?: string;
}

export interface InitialData {
  user: InitialDataUser;
  clientCompanies: ClientCompany[];
  assignedProjects?: AssignedProject[];
}

@Injectable({
  providedIn: 'root',
})
export class InitializerService {
  private _initialData = new BehaviorSubject<InitialData | null>(null);
  public initialData$ = this._initialData.asObservable();

  private _currentUser = new BehaviorSubject<InitialDataUser | null>(null);
  public currentUser$ = this._currentUser.asObservable();

  private _currentClientCompany = new BehaviorSubject<ClientCompany | null>(null);
  public currentClientCompany$ = this._currentClientCompany.asObservable();

  private _assignedProjects = new BehaviorSubject<AssignedProject[]>([]);
  public assignedProjects$ = this._assignedProjects.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
    private store: Store,
  ) {}

  /**
   * Loads application initial data
   */
  loadInitialAppData(): Observable<InitialData | null> {
    // Use the full URL directly instead of relying on ApiPrefixInterceptor
    const url = `${environment.apiUrl}/get-initial-data`;

    // Create a proper HttpContext with both tokens
    const context = new HttpContext().set(SKIP_API_PREFIX, true).set(SKIP_AUTH_CHECK, true);

    return this.http.get<InitialData>(url, { context }).pipe(
      tap((data) => {
        console.log('✅ InitializerService: Initial app data loaded', {
          user: data?.user ? `${data.user.firstName} ${data.user.lastName}` : 'none',
          clientCompaniesCount: data?.clientCompanies?.length || 0,
          assignedProjectsCount: data?.assignedProjects?.length || 0,
        });

        this._initialData.next(data);

        // Dispatch to store - this is crucial for the ClientService to work
        this.store.dispatch(AppDataActions.loadInitialDataSuccess({ data }));

        // If user data is present, update the current user subject
        if (data && data.user) {
          this._currentUser.next(data.user);
          this.store.dispatch(AppDataActions.updateUser({ user: data.user }));
        }

        // Set the first client company as default if available
        if (data && data.clientCompanies && data.clientCompanies.length > 0) {
          this._currentClientCompany.next(data.clientCompanies[0]);
          this.store.dispatch(AppDataActions.updateCurrentClientCompany({ clientCompany: data.clientCompanies[0] }));
        }

        // Set assigned projects if available
        if (data && data.assignedProjects) {
          this._assignedProjects.next(data.assignedProjects);
          this.store.dispatch(AppDataActions.updateAssignedProjects({ projects: data.assignedProjects }));
        }
      }),
      catchError((error) => {
        console.error('❌ InitializerService: Failed to load initial app data', error);

        // Dispatch error to store
        this.store.dispatch(
          AppDataActions.loadInitialDataFailure({
            error: error.message || 'Failed to load initial data',
          }),
        );

        // If we get a 401/403 during initialization, go to login
        if (error.status === 401) {
          // Only navigate to login if not already on login page
          if (!this.router.url.includes('/login')) {
            this.router.navigate(['/login']);
          }
        }

        return of(null); // Return null instead of failing app initialization
      }),
    );
  }

  /**
   * Get the initial data as a snapshot (for synchronous access)
   */
  getInitialData(): InitialData | null {
    return this._initialData.getValue();
  }

  /**
   * Get the current user data as a snapshot (for synchronous access)
   */
  getCurrentUser(): InitialDataUser | null {
    return this._currentUser.getValue();
  }

  /**
   * Get the current client company data as a snapshot (for synchronous access)
   */
  getCurrentClientCompany(): ClientCompany | null {
    return this._currentClientCompany.getValue();
  }

  /**
   * Set the current client company
   */
  setCurrentClientCompany(clientCompany: ClientCompany): void {
    this._currentClientCompany.next(clientCompany);
    this.store.dispatch(AppDataActions.updateCurrentClientCompany({ clientCompany }));
  }

  /**
   * Get all client companies
   */
  getClientCompanies(): ClientCompany[] {
    const data = this._initialData.getValue();
    return data?.clientCompanies || [];
  }

  /**
   * Get assigned projects as a snapshot (for synchronous access)
   */
  getAssignedProjects(): AssignedProject[] {
    return this._assignedProjects.getValue();
  }

  /**
   * Set assigned projects
   */
  setAssignedProjects(projects: AssignedProject[]): void {
    this._assignedProjects.next(projects);
    this.store.dispatch(AppDataActions.updateAssignedProjects({ projects }));
  }
}
