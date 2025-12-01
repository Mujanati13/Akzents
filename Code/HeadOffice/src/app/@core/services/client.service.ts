import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, ReplaySubject, combineLatest } from 'rxjs';
import { Store } from '@ngrx/store';
import { selectClientCompanies, selectInitialDataLoaded } from '@app/@core/store/app-data/app-data.selectors';
import { ClientCompany } from '@app/core/services/client-company.service';
import { filter, tap, map, catchError } from 'rxjs/operators';
import { ClientCompanyService } from '@app/core/services/client-company.service';

export interface Project {
  id: string;
  name: string;
  clientId: string;
}

export interface Client {
  id: string;
  name: string;
  projects?: Project[];
  image?: string;
  logo?: {
    id: string;
    path: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class ClientService {
  private clientsSubject = new BehaviorSubject<Client[]>([]);
  private selectedClientSubject = new ReplaySubject<Client | null>(1);

  constructor(
    private store: Store,
    private clientCompanyService: ClientCompanyService,
  ) {
    this.initializeFromStore();
  }

  private initializeFromStore(): void {
    // Subscribe to both client companies and initial data loaded state
    combineLatest([this.store.select(selectClientCompanies), this.store.select(selectInitialDataLoaded)])
      .pipe(
        filter(([clientCompanies, initialDataLoaded]) => {
          // Only process when initial data is loaded and we have client companies
          return initialDataLoaded && Array.isArray(clientCompanies) && clientCompanies.length > 0;
        }),
        tap(([clientCompanies, initialDataLoaded]) => {
          console.log('🔄 ClientService: Processing store data:', {
            initialDataLoaded,
            clientCompaniesCount: clientCompanies.length,
            currentClientsCount: this.clientsSubject.value.length,
          });
        }),
      )
      .subscribe(([clientCompanies]) => {
        const clients = this.transformClientCompaniesToClients(clientCompanies);
        this.clientsSubject.next(clients);
        console.log('✅ ClientService: Updated clients from store:', clients.length);
      });
  }

  private transformClientCompaniesToClients(clientCompanies: ClientCompany[]): Client[] {
    return clientCompanies.map((company) => ({
      id: company.id.toString(),
      name: company.name,
      logo: company.logo || undefined,
      image: company.logo?.path || undefined,
      projects: [], // Projects will need to be loaded separately or from additional API data
    }));
  }

  getClients(): Observable<Client[]> {
    return this.clientsSubject.asObservable();
  }

  getClientById(id: string): Client | undefined {
    const clients = this.clientsSubject.getValue();
    const client = clients.find((client) => client.id === id);

    console.log('🔍 ClientService: Looking for client with id:', id, {
      availableClients: clients.map((c) => ({ name: c.name, id: c.id })),
      foundClient: client ? { name: client.name, id: client.id } : null,
    });

    if (client) {
      this.selectedClientSubject.next(client);
    } else {
      this.selectedClientSubject.next(null);
    }
    return client;
  }

  getSelectedClient(): Observable<Client | null> {
    return this.selectedClientSubject.asObservable();
  }

  clearSelectedClient(): void {
    this.selectedClientSubject.next(null);
  }

  getProjectById(clientId: string, projectId: string): Project | undefined {
    const clients = this.clientsSubject.getValue();
    const client = clients.find((c) => c.id === clientId);
    return client?.projects?.find((p) => p.id === projectId);
  }

  /**
   * Update sidebar clients with fresh data from clients list component
   * This is called when the clients list loads fresh data
   */
  updateSidebarClients(clientCompanies: ClientCompany[]): void {
    console.log('🔄 ClientService: Updating sidebar with fresh client data:', clientCompanies.length);
    const clients = this.transformClientCompaniesToClients(clientCompanies);
    this.clientsSubject.next(clients);
  }

  /**
   * Force refresh clients from store (useful for debugging or manual refresh)
   */
  refreshFromStore(): void {
    console.log('🔄 ClientService: Force refreshing from store');
    this.store
      .select(selectClientCompanies)
      .pipe(filter((clientCompanies) => Array.isArray(clientCompanies) && clientCompanies.length > 0))
      .subscribe((clientCompanies) => {
        const clients = this.transformClientCompaniesToClients(clientCompanies);
        this.clientsSubject.next(clients);
        console.log('✅ ClientService: Force refreshed clients:', clients.length);
      });
  }

  /**
   * Fetch a client by id from the backend if not found in the local store.
   * Updates the local store and selected client.
   */
  fetchClientById(id: string): Observable<Client | undefined> {
    const found = this.getClientById(id);
    if (found) {
      return new BehaviorSubject(found).asObservable();
    }
    // Try to fetch from backend
    return this.clientCompanyService.getClientCompanyWithRelationships(Number(id)).pipe(
      tap((company: any) => {
        const client: Client = {
          id: company.id.toString(),
          name: company.name,
          logo: company.logo || undefined,
          image: company.logo?.path || undefined,
          projects: [], // You may want to map projects if available
        };
        // Add to local store
        const clients = this.clientsSubject.getValue();
        this.clientsSubject.next([...clients, client]);
        this.selectedClientSubject.next(client);
      }),
      map((company: any) => {
        return {
          id: company.id.toString(),
          name: company.name,
          logo: company.logo || undefined,
          image: company.logo?.path || undefined,
          projects: [],
        } as Client;
      }),
      catchError(() => {
        this.selectedClientSubject.next(null);
        return new BehaviorSubject(undefined).asObservable();
      }),
    );
  }
}
