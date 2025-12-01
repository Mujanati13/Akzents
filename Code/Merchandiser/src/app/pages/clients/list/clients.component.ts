import { Component, inject, OnInit } from '@angular/core';
import { HotToastService } from '@ngneat/hot-toast';
import { ClientCompanyService, ClientCompany, InfinityPaginationResponse } from '@app/@core/services/client-company.service';
import { ClientService } from '@app/@core/services/client.service';
import { finalize, catchError, of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
interface ReportCounts {
  newReports: number;
  ongoingReports: number;
  completedReports: number;
}

interface CardItem {
  id: number;
  isFavorite: boolean;
  name: string;
  city: string;
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
  searchTerm: string = '';
  showOnlyFavorites: boolean = false;
  activeFilter: 'all' | 'favorites' = 'all';
  // Pagination properties
  currentPage = 1;
  pageSize = 0; // Get more items at once
  hasNextPage = false;
  isLoadingMore = false;

  private readonly _toast = inject(HotToastService);
  statusFilter: string;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientCompanyService: ClientCompanyService,
    private clientService: ClientService,
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      this.statusFilter = this.route.snapshot.queryParamMap.get('status') || '';
    });
    this.loadClientCompanies();
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
          console.log('📊 Response data length:', response.data?.length);
          console.log('📊 Response hasNextPage:', response.hasNextPage);

          // Transform backend data to CardItem format
          const transformedCards = this.transformToCardItems(response.data);
          console.log('📊 Transformed cards length:', transformedCards.length);

          if (this.currentPage === 1) {
            // First load - replace all cards
            this.cards = transformedCards;
            this.allCards = [...transformedCards];
            console.log('📊 First load - cards set to:', this.cards.length);
            console.log('📊 First load - allCards set to:', this.allCards.length);

            // Update sidebar with fresh data (only on first load, not pagination)
            this.clientService.updateSidebarClients(response.data);
          } else {
            // Pagination - append to existing cards
            this.cards = [...this.cards, ...transformedCards];
            this.allCards = [...this.allCards, ...transformedCards];
            console.log('📊 Pagination - cards updated to:', this.cards.length);
          }

          this.hasNextPage = response.hasNextPage;

          // Apply current filters
          this.applyFilters();
          console.log('📊 After applyFilters - cards length:', this.cards.length);

          this._toast.success(`${response.data.length} Kunden geladen`, {
            position: 'bottom-right',
            duration: 2000,
          });
        },
      });
  }

  /**
   * Transform ClientCompany data to CardItem format
   */
  private transformToCardItems(companies: ClientCompany[]): CardItem[] {
    console.log('🔄 ClientsComponent: Transforming companies to cards:', companies);

    const transformed = companies.map((company) => ({
      id: company.id,
      isFavorite: company.isFavorite || false,
      name: company.name,
      city: 'Unknown', // TODO: Add city field to ClientCompany or get from company data
      image: company.logo?.path || '/images/projects/default-company.png',
      logo: company.logo,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      reportCounts: (company as any).reportCounts,
    }));

    console.log('✅ ClientsComponent: Transformed cards:', transformed);
    return transformed;
  }

  /**
   * Load more client companies (pagination)
   */
  loadMore(): void {
    if (this.isLoadingMore || !this.hasNextPage) {
      return;
    }

    this.isLoadingMore = true;
    this.currentPage++;

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

          // Append new cards
          this.allCards = [...this.allCards, ...transformedCards];
          this.hasNextPage = response.hasNextPage;

          // Apply current filters to include new items
          this.applyFilters();

          if (response.data.length > 0) {
            this._toast.success(`${response.data.length} weitere Kunden geladen`, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
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
    this.loadClientCompanies();
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

            // Update the status based on server response
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
    this.resetFilters();
  }

  toggleFavoritesFilter() {
    this.activeFilter = 'favorites';
    this.showOnlyFavorites = true;
    this.applyFilters();
  }

  onSearchInput(event: any) {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  private applyFilters() {
    console.log('🔄 ClientsComponent: Applying filters...');
    console.log('📊 allCards length before filter:', this.allCards.length);
    console.log('📊 showOnlyFavorites:', this.showOnlyFavorites);
    console.log('📊 searchTerm:', this.searchTerm);

    let filteredCards = [...this.allCards];

    // Apply favorites filter
    if (this.showOnlyFavorites) {
      filteredCards = filteredCards.filter((card) => card.isFavorite);
      console.log('📊 After favorites filter:', filteredCards.length);
    }

    // Apply search filter
    if (this.searchTerm.trim()) {
      const searchLower = this.searchTerm.toLowerCase();
      filteredCards = filteredCards.filter((card) => {
        // Search in name and city fields
        return card.name.toLowerCase().includes(searchLower) || card.city.toLowerCase().includes(searchLower) || card.id.toString().includes(searchLower);
      });
      console.log('📊 After search filter:', filteredCards.length);
    }

    this.cards = filteredCards;
    console.log('📊 Final cards length:', this.cards.length);
  }

  private resetFilters() {
    this.cards = [...this.allCards];
  }

  userClicked() {
    this._toast.show('User clicked');
  }
}
