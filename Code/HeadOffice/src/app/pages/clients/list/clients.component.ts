import { Component, inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { HotToastService } from '@ngxpert/hot-toast';
import { ClientCompanyService, ClientCompany, InfinityPaginationResponse } from '@app/core/services/client-company.service';
import { ClientService } from '@app/@core/services/client.service'; // Add this import
import { finalize, catchError, of, take } from 'rxjs';

interface ReportCounts {
  newReports: number;
  ongoingReports: number;
  completedReports: number;
}

interface City {
  id: number;
  name: string;
  coordinates: number[];
  country: {
    id: number;
    name: {
      de: string;
    };
    flag: string | null;
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface CardItem {
  id: number;
  isFavorite: boolean;
  name: string;
  city: string; // Keep for backward compatibility
  cities: City[]; // Add cities array from backend
  image: string;
  logo?: {
    id: string;
    path: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  reportCounts?: ReportCounts;
}

@Component({
  selector: 'app-clients',
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
  standalone: false,
})
export class ClientsComponent implements OnInit {
  isLoading = true;
  cards: CardItem[] = [];
  allCards: CardItem[] = []; // Store original list
  myClientIds: Set<number> = new Set(); // Store IDs of "my clients" for client-side filtering
  searchTerm: string = '';
  showOnlyFavorites: boolean = false;
  activeFilter: 'all' | 'my-clients' = 'all'; // Changed from 'favorites' to 'my-clients'

  // Pagination properties
  currentPage = 1;
  pageSize = 0; // Get more items at once
  hasNextPage = false;
  isLoadingMore = false;

  private readonly _toast = inject(HotToastService);

  constructor(
    private clientCompanyService: ClientCompanyService,
    private clientService: ClientService, // Add this
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Check for filter state and search term in query parameters on initial load
    this.route.queryParams.pipe(take(1)).subscribe((params) => {
      const filterParam = params['filter'];
      const searchParam = params['search'];
      
      // Restore search term if present
      if (searchParam) {
        this.searchTerm = searchParam;
      }
      
      // Restore filter state
      if (filterParam === 'my-clients') {
        this.activeFilter = 'my-clients';
      } else {
        this.activeFilter = 'all';
      }
      
      // Load all clients and my clients IDs for client-side filtering
      // Filters will be applied after data loads
      this.loadClientCompanies();
      this.loadMyClientIds();
    });
  }

  /**
   * Load IDs of client companies assigned to current Akzente user (for client-side filtering)
   */
  private loadMyClientIds(): void {
    console.log('🔄 Loading my client IDs for filtering...');

    this.clientCompanyService
      .getMyClientCompanies(1, 0) // Get all my clients (limit 0 means all)
      .pipe(
        catchError((error) => {
          console.error('❌ Error loading my client IDs:', error);
          // Don't show error to user, just continue without my clients filter
          return of({ data: [], hasNextPage: false } as InfinityPaginationResponse<ClientCompany>);
        }),
      )
      .subscribe({
        next: (response: InfinityPaginationResponse<ClientCompany>) => {
          // Store IDs of "my clients" for client-side filtering
          this.myClientIds = new Set(response.data.map(company => company.id));
          console.log('✅ My client IDs loaded:', Array.from(this.myClientIds));
          
          // Apply filters if we already have data loaded
          if (this.allCards.length > 0) {
            this.applyFilters();
          }
        },
      });
  }

  /**
   * Load client companies from the backend
   */
  loadClientCompanies(): void {
    this.isLoading = true;

    console.log('🔄 Loading client companies...');

    this.clientCompanyService
      .getClientCompanies(this.currentPage, this.pageSize)
      .pipe(
        finalize(() => {
          this.isLoading = false;
        }),
        catchError((error) => {
          console.error('❌ Error loading client companies:', error);

          this._toast.error('Fehler beim Laden der Kunden', {
            position: 'bottom-right',
            duration: 4000,
          });

          // Return empty response to continue with empty state
          return of({ data: [], hasNextPage: false } as InfinityPaginationResponse<ClientCompany>);
        }),
      )
      .subscribe({
        next: (response: InfinityPaginationResponse<ClientCompany>) => {
          console.log('✅ Client companies loaded:', response);

          // Transform backend data to CardItem format
          const transformedCards = this.transformToCardItems(response.data);

          if (this.currentPage === 1) {
            // First load - replace all cards
            this.cards = transformedCards;
            this.allCards = [...transformedCards];

            // Update sidebar with fresh data (only on first load, not pagination)
            this.clientService.updateSidebarClients(response.data);
          } else {
            // Pagination - append to existing cards
            this.cards = [...this.cards, ...transformedCards];
            this.allCards = [...this.allCards, ...transformedCards];
          }

          this.hasNextPage = response.hasNextPage;

          // Apply current filters
          this.applyFilters();

          
        },
      });
  }

  /**
   * Transform ClientCompany data to CardItem format
   */
  private transformToCardItems(companies: ClientCompany[]): CardItem[] {
    return companies.map((company) => {
      // Get cities from backend response
      const cities = (company as any).cities || [];

      // Use first city name as primary city for backward compatibility
      const primaryCity = cities.length > 0 ? cities[0].name : 'Unknown';

      return {
        id: company.id,
        isFavorite: company.isFavorite || false, // Use the real favorite status from backend
        name: company.name,
        city: primaryCity, // Primary city for backward compatibility
        cities: cities, // Full cities array from backend
        image: company.logo?.path || '/images/projects/default-company.png', // Fallback image
        logo: company.logo,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        reportCounts: (company as any).reportCounts, // Include report counts from API response
      };
    });
  }

  /**
   * Load more client companies (pagination)
   * Always loads all clients, then filters client-side
   */
  loadMore(): void {
    if (this.isLoadingMore || !this.hasNextPage) {
      return;
    }

    this.isLoadingMore = true;
    this.currentPage++;

    // Always load all clients (not filtered), then filter client-side
    this.clientCompanyService
      .getClientCompanies(this.currentPage, this.pageSize)
      .pipe(
        finalize(() => {
          this.isLoadingMore = false;
        }),
        catchError((error) => {
          console.error('❌ Error loading more client companies:', error);

          this._toast.error('Fehler beim Laden weiterer Kunden', {
            position: 'bottom-right',
            duration: 4000,
          });

          // Reset page counter on error
          this.currentPage--;

          return of({ data: [], hasNextPage: false } as InfinityPaginationResponse<ClientCompany>);
        }),
      )
      .subscribe({
        next: (response: InfinityPaginationResponse<ClientCompany>) => {
          console.log('✅ More client companies loaded:', response);

          const transformedCards = this.transformToCardItems(response.data);

          // Append new cards to allCards
          this.allCards = [...this.allCards, ...transformedCards];
          this.hasNextPage = response.hasNextPage;

          // Apply current filters to include new items (client-side filtering)
          this.applyFilters();

         
        },
      });
  }

  /**
   * Refresh the client companies list
   */
  refreshClients(): void {
    this.currentPage = 1;
    this.hasNextPage = false;
    this.cards = [];
    this.allCards = [];
    this.loadClientCompanies(); // This will automatically update the sidebar too
  }

  /**
   * Handle favorite toggle with backend call
   */
  onFavoriteChanged(newStatus: boolean, item: CardItem): void {
    console.log('🔄 Toggling favorite status:', { id: item.id, newStatus });

    // Optimistically update the UI
    const previousStatus = item.isFavorite;
    item.isFavorite = newStatus;

    // Also update in the original list
    const originalItem = this.allCards.find((card) => card.id === item.id);
    if (originalItem) {
      originalItem.isFavorite = newStatus;
    }

    // If in favorites mode and item is unfavorited, re-apply filter
    if (this.showOnlyFavorites && !newStatus) {
      this.applyFilters();
    }

    // Call backend to toggle favorite status
    this.clientCompanyService
      .toggleFavoriteStatus(item.id)
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling favorite status:', error);

          // Revert the optimistic update on error
          item.isFavorite = previousStatus;
          if (originalItem) {
            originalItem.isFavorite = previousStatus;
          }

          // Re-apply filters to show correct state
          this.applyFilters();

          this._toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });

          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Favorite status updated:', result);

            // Update the status based on server response (in case of any discrepancy)
            item.isFavorite = result.isFavorite;
            if (originalItem) {
              originalItem.isFavorite = result.isFavorite;
            }

            // Re-apply filters with correct state
            if (this.showOnlyFavorites && !result.isFavorite) {
              this.applyFilters();
            }

            this._toast.success(result.message, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }

  // Filter methods
  showAllClients() {
    this.activeFilter = 'all';
    this.showOnlyFavorites = false;
    this.searchTerm = '';
    // Update URL to remember filter state (clear search term)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: 'all', search: null },
      queryParamsHandling: 'merge',
    });
    // Apply client-side filtering (no API call)
    this.applyFilters();
  }

  toggleMyClientsFilter() {
    this.activeFilter = 'my-clients';
    this.showOnlyFavorites = false;
    this.searchTerm = '';
    // Update URL to remember filter state (clear search term)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: 'my-clients', search: null },
      queryParamsHandling: 'merge',
    });
    // Apply client-side filtering (no API call)
    this.applyFilters();
  }

  onSearchInput(event: any) {
    this.searchTerm = event.target.value;
    // Update URL to remember search term
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: this.searchTerm || null },
      queryParamsHandling: 'merge',
    });
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchTerm = '';
    // Update URL to clear search term
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null },
      queryParamsHandling: 'merge',
    });
    this.applyFilters();
  }

  private applyFilters() {
    let filteredCards = [...this.allCards];

    // Apply "my clients" filter (client-side)
    if (this.activeFilter === 'my-clients') {
      filteredCards = filteredCards.filter((card) => this.myClientIds.has(card.id));
    }

    // Apply favorites filter
    if (this.showOnlyFavorites) {
      filteredCards = filteredCards.filter((card) => card.isFavorite);
    }

    // Apply search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase();
      filteredCards = filteredCards.filter((card) => {
        // Search in name, primary city, and all cities in the cities array
        const matchesName = card.name.toLowerCase().includes(searchLower);
        const matchesPrimaryCity = card.city.toLowerCase().includes(searchLower);
        const matchesId = card.id.toString().includes(searchLower);

        // Search through all cities in the cities array
        const matchesCities = card.cities.some((city) => city.name.toLowerCase().includes(searchLower));

        return matchesName || matchesPrimaryCity || matchesId || matchesCities;
      });
    }

    this.cards = filteredCards;
  }

  private resetFilters() {
    this.cards = [...this.allCards];
  }

  /**
   * Check if any filters are currently active
   */
  hasActiveFilters(): boolean {
    return this.activeFilter !== 'all' || this.searchTerm.trim().length > 0 || this.showOnlyFavorites;
  }

  /**
   * Clear all filters and reset to default state
   */
  clearFilters(): void {
    this.activeFilter = 'all';
    this.searchTerm = '';
    this.showOnlyFavorites = false;
    this.currentPage = 1;
    this.allCards = [];
    this.cards = [];
    // Update URL to clear all filter state
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter: 'all', search: null },
      queryParamsHandling: 'merge',
    });
    this.loadClientCompanies();
  }

  userClicked() {
    this._toast.show('User clicked');
  }

  /**
   * Navigate to client detail page
   */
  navigateToClient(clientId: number, newTab: boolean = false): void {
    const queryParams = { ...this.route.snapshot.queryParams };

    if (newTab) {
      const urlTree = this.router.createUrlTree(['/clients', clientId], { queryParams });
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/clients', clientId], { queryParams });
    }
  }

  /**
   * Navigate to client edit page
   */
  navigateToClientEdit(clientId: number, newTab: boolean = false): void {
    const queryParams = { ...this.route.snapshot.queryParams };

    if (newTab) {
      const urlTree = this.router.createUrlTree(['/clients', clientId, 'edit'], { queryParams });
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/clients', clientId, 'edit'], { queryParams });
    }
  }

  /**
   * Navigate to client reports filtered by status
   */
  navigateToClientReports(clientId: number, status: 'new' | 'ongoing' | 'completed', newTab: boolean = false): void {
    const queryParams = {
      ...this.route.snapshot.queryParams,
      status: status,
    };

    if (newTab) {
      const urlTree = this.router.createUrlTree(['/clients', clientId], { queryParams });
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/clients', clientId], { queryParams });
    }
  }

  openClientInNewTab(clientId: number): void {
    this.navigateToClient(clientId, true);
  }

  openClientEditInNewTab(clientId: number): void {
    this.navigateToClientEdit(clientId, true);
  }

  openClientReportsInNewTab(clientId: number, status: 'new' | 'ongoing' | 'completed'): void {
    this.navigateToClientReports(clientId, status, true);
  }

  onFavoriteContextMenu(event: MouseEvent, clientId: number): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openClientInNewTab(clientId);
    return false;
  }

  /**
   * Navigate to add client page, preserving current filter state
   */
  navigateToAddClient(): void {
    const queryParams = { ...this.route.snapshot.queryParams };
    this.router.navigate(['/clients/add'], { queryParams });
  }

  /**
   * Check if a client is "my client"
   */
  isMyClient(clientId: number): boolean {
    return this.myClientIds.has(clientId);
  }
}
