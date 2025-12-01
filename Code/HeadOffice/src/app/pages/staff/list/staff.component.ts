import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { HttpClient, HttpHeaders, HttpContext } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { HotToastService } from '@ngxpert/hot-toast';
import { Merchandiser, MerchandiserSearchParams, MerchandiserService } from '@app/core/services/merchandiser.service';
import { SKIP_API_PREFIX, SKIP_AUTH_CHECK } from '@app/@core/interceptors/api-prefix.interceptor';
import { finalize, catchError, of, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { StaffTableComponent } from '../components/staff-table/staff-table.component';

interface Column {
  field: string;
  header: string;
}

interface Staff {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  distance?: string;
  qualifications?: string[];
  dateOfBirth?: string;
  status?: string;
  portrait?: {
    id?: string;
    path?: string;
  };
  isFavorite?: boolean;
  location?: { lat: number; lng: number };
  clientCompanies?: { id: number; name: string }[];
}

@Component({
  selector: 'app-staff',
  standalone: false,
  templateUrl: './staff.component.html',
  styleUrls: ['./staff.component.scss'],
})
export class StaffComponent implements OnInit {
  staffData: Staff[] = [];
  allStaffData: Staff[] = []; // Store all loaded data for client-side filtering
  viewMode: 'table' | 'map' | 'grid' = 'table';
  expandedRows = {};
  cols: Column[] = [];
  selectedColumns: Column[] = [];

  // Add loading and error states
  loading = false;
  error: string | null = null;

  // Add pagination
  currentPage = 1;
  pageSize = 8; // Default to 8 rows per page
  totalItems = 0;
  first = 0; // For PrimeNG paginator

  // Add search parameters with required fields
  searchParams: MerchandiserSearchParams = {
    name: '',
    location: '',
    qualifications: '',
    status: '',
    clientAssignment: '',
    customFilter: '',
    page: 1,
    // Don't set limit by default - will be set based on view mode
  };

  // Filter options with checkboxes
  filters = {
    firstName: '',
    lastName: '',
    address: '',
    country: '',
    distance: '',
    qualifications: {} as Record<string, boolean>,
    status: {} as Record<string, boolean>,
  };

  // Job types for qualification dropdown
  jobTypes: { id: number; name: string }[] = [];
  selectedQualification: string | null = null;

  // Statuses for status dropdown
  statuses: { id: number; name: string }[] = [];
  selectedStatus: string | null = null;

  private searchTimeout: any;
  private readonly _toast = inject(HotToastService);
  
  // Store reference location coordinates for distance calculation
  private referenceLocation: { lat: number; lng: number } | null = null;

  @ViewChild('staffTable') staffTableComponent?: StaffTableComponent;

  constructor(
    private merchandiserService: MerchandiserService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.initializeColumns();
    this.restoreStateFromQueryParams();
    this.loadFilterOptions();
    
    // If location is restored from query params, trigger search to calculate distances
    if (this.searchParams.location?.trim()) {
      this.onSearch();
    } else {
      this.loadStaffData();
    }
  }

  private restoreStateFromQueryParams(): void {
    const queryParams = this.route.snapshot.queryParams;
    
    // Restore view mode
    if (queryParams['viewMode'] && ['table', 'map', 'grid'].includes(queryParams['viewMode'])) {
      this.viewMode = queryParams['viewMode'];
    }

    // Restore search parameters
    if (queryParams['name']) {
      this.searchParams.name = queryParams['name'];
    }
    if (queryParams['location']) {
      this.searchParams.location = queryParams['location'];
    }
    if (queryParams['qualifications']) {
      this.searchParams.qualifications = queryParams['qualifications'];
      // Also restore selectedQualification for dropdown and map component
      this.selectedQualification = queryParams['qualifications'];
    }
    if (queryParams['status']) {
      this.searchParams.status = queryParams['status'];
      // Also restore selectedStatus for dropdown and map component
      this.selectedStatus = queryParams['status'];
    }
    if (queryParams['clientAssignment']) {
      this.searchParams.clientAssignment = queryParams['clientAssignment'];
    }
    if (queryParams['customFilter']) {
      this.searchParams.customFilter = queryParams['customFilter'];
    }
  }

  private getNavigationQueryParams(): Record<string, any> {
    const params: Record<string, any> = {
      viewMode: this.viewMode,
    };

    // Add non-empty search parameters
    if (this.searchParams.name?.trim()) {
      params['name'] = this.searchParams.name;
    }
    if (this.searchParams.location?.trim()) {
      params['location'] = this.searchParams.location;
    }
    if (this.searchParams.qualifications?.trim()) {
      params['qualifications'] = this.searchParams.qualifications;
    }
    if (this.searchParams.status?.trim()) {
      params['status'] = this.searchParams.status;
    }
    if (this.searchParams.clientAssignment?.trim()) {
      params['clientAssignment'] = this.searchParams.clientAssignment;
    }
    if (this.searchParams.customFilter?.trim()) {
      params['customFilter'] = this.searchParams.customFilter;
    }

    return params;
  }

  private loadFilterOptions() {
    this.merchandiserService.getFilterOptions().subscribe({
      next: (response) => {
        // Store job types for dropdown
        this.jobTypes = response.jobTypes || [];

        // Store statuses for dropdown
        this.statuses = response.statuses || [];

        // Initialize selected qualification from searchParams if it exists
        if (this.searchParams.qualifications) {
          this.selectedQualification = this.searchParams.qualifications;
        }

        // Initialize selected status from searchParams if it exists
        if (this.searchParams.status) {
          this.selectedStatus = this.searchParams.status;
        }

        // Populate qualifications checkboxes
        this.filters.qualifications = {};
        response.jobTypes.forEach((jt) => {
          this.filters.qualifications[jt.name] = false;
        });

        // Populate status checkboxes
        this.filters.status = {};
        response.statuses.forEach((s) => {
          this.filters.status[s.name] = false;
        });

        this.debug('filter options loaded', {
          qualifications: Object.keys(this.filters.qualifications),
          statuses: Object.keys(this.filters.status),
          jobTypes: this.jobTypes.length,
          statusesCount: this.statuses.length,
        });
      },
      error: (error) => {
        console.error('❌ Error loading filter options:', error);
        // Don't show error to user, just continue without filters
      },
    });
  }

  setViewMode(mode: 'table' | 'map' | 'grid') {
    this.viewMode = mode;
    this.debug('viewMode changed', { mode });
    
    // Update query parameters to preserve view mode
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.getNavigationQueryParams(),
      queryParamsHandling: 'merge',
    });
    
    // If we already have data loaded, just apply filters client-side
    if (this.allStaffData.length > 0) {
      this.applyClientSideFilters();
    } else {
      // Otherwise, load data from server
      if (mode === 'map' || mode === 'grid') {
        delete this.searchParams.limit;
        this.searchParams.page = 1;
      } else {
        this.searchParams.limit = this.pageSize;
        this.searchParams.page = this.currentPage;
      }
      
      if (this.searchParams.location?.trim()) {
        this.performSearchWithLocationFilter();
      } else {
        this.performSearchWithoutLocationFilter();
      }
    }
  }

  private initializeColumns() {
    this.cols = [
      { field: 'lastName', header: 'Nachname' },
      { field: 'email', header: 'E-Mail' },
      { field: 'phone', header: 'Telefon' },
      { field: 'address', header: 'Adresse' },
      { field: 'city', header: 'Stadt' },
      { field: 'distance', header: 'Entfernung' },
      { field: 'qualifications', header: 'Qualifikation' },
      { field: 'status', header: 'Status' },
    ];
    // Exclude status column from initial selection
    this.selectedColumns = this.cols.filter(col => col.field !== 'status');
  }

  private loadStaffData() {
    this.loading = true;
    this.error = null;

    // On initial load, fetch ALL merchandisers (no limit)
    // This ensures we have all data for client-side filtering
    const loadParams = {
      ...this.searchParams,
      page: 1,
      limit: undefined, // Explicitly don't set limit to fetch all records
    };
    delete loadParams.limit; // Ensure limit is not sent

    this.debug('loadStaffData start', { params: loadParams });

    // Use searchMerchandisers to fetch all records
    this.merchandiserService.searchMerchandisers(loadParams).subscribe({
      next: (response) => {
        this.debug('loadStaffData success', {
          responseKeys: Object.keys(response),
          loaded: response.data.length,
          totalCount: response.totalCount,
        });
        // Store all loaded data for client-side filtering
        this.allStaffData = this.mapMerchandisersToStaff(response.data);
        // Update totalItems for pagination display
        this.totalItems = response.totalCount || response.data.length;
        // Apply initial filters
        this.applyClientSideFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading merchandisers:', error);
        this.error = 'Fehler beim Laden der Merchandiser-Daten';
        this.loading = false;
      },
    });
  }

  // Client-side filtering function
  private filterStaffData(): Staff[] {
    let filtered = [...this.allStaffData];

    // Filter by name
    if (this.searchParams.name?.trim()) {
      const nameTerm = this.searchParams.name.toLowerCase().trim();
      filtered = filtered.filter(staff => 
        (staff.firstName?.toLowerCase().includes(nameTerm) || 
         staff.lastName?.toLowerCase().includes(nameTerm) ||
         `${staff.firstName} ${staff.lastName}`.toLowerCase().includes(nameTerm) ||
         staff.email?.toLowerCase().includes(nameTerm))
      );
    }

    // Filter by location (city/postal code)
    if (this.searchParams.location?.trim()) {
      const locationTerm = this.searchParams.location.toLowerCase().trim();
      filtered = filtered.filter(staff => 
        staff.city?.toLowerCase().includes(locationTerm) ||
        staff.postalCode?.toLowerCase().includes(locationTerm) ||
        staff.address?.toLowerCase().includes(locationTerm)
      );
    }

    // Filter by qualifications
    if (this.searchParams.qualifications?.trim()) {
      const qualTerm = this.searchParams.qualifications.toLowerCase().trim();
      filtered = filtered.filter(staff => 
        staff.qualifications?.some((q: string) => 
          q.toLowerCase().includes(qualTerm)
        )
      );
    }

    // Filter by status
    if (this.searchParams.status?.trim()) {
      filtered = filtered.filter(staff => 
        staff.status?.toLowerCase() === this.searchParams.status.toLowerCase()
      );
    }

    // Filter by client assignment
    if (this.searchParams.clientAssignment?.trim()) {
      const clientTerm = this.searchParams.clientAssignment.toLowerCase().trim();
      filtered = filtered.filter(staff => 
        staff.clientCompanies?.some((cc: any) => 
          cc.name?.toLowerCase().includes(clientTerm)
        )
      );
    }

    // Filter by custom filter (search in multiple fields)
    if (this.searchParams.customFilter?.trim()) {
      const customTerm = this.searchParams.customFilter.toLowerCase().trim();
      filtered = filtered.filter(staff => 
        staff.firstName?.toLowerCase().includes(customTerm) ||
        staff.lastName?.toLowerCase().includes(customTerm) ||
        staff.email?.toLowerCase().includes(customTerm) ||
        staff.phone?.toLowerCase().includes(customTerm) ||
        staff.address?.toLowerCase().includes(customTerm) ||
        staff.city?.toLowerCase().includes(customTerm) ||
        staff.country?.toLowerCase().includes(customTerm) ||
        staff.qualifications?.some((q: string) => q.toLowerCase().includes(customTerm)) ||
        staff.status?.toLowerCase().includes(customTerm)
      );
    }

    // Calculate distances if location search is active
    if (this.referenceLocation && this.searchParams.location?.trim()) {
      filtered = filtered.map(staff => ({
        ...staff,
        distance: this.calculateHaversineDistance(this.referenceLocation!, staff.location),
      })).sort((a, b) => {
        const distanceA = this.parseDistanceToKm(a.distance || '999999 km');
        const distanceB = this.parseDistanceToKm(b.distance || '999999 km');
        return distanceA - distanceB;
      });
    }

    return filtered;
  }

  // Add search functionality - now client-side only
  onSearch() {
    this.currentPage = 1;
    this.first = 0;

    // Update query parameters to preserve search state
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.getNavigationQueryParams(),
      queryParamsHandling: 'merge',
    });

    const locationQuery = this.searchParams.location?.trim() || '';

    // If location search is provided, geocode it first for distance calculation
    if (locationQuery && !this.referenceLocation) {
      this.geocodeLocation(locationQuery).subscribe({
        next: (coords) => {
          if (coords) {
            this.referenceLocation = coords;
            this.applyClientSideFilters();
          } else {
            this._toast.error('Ort konnte nicht gefunden werden. Bitte versuchen Sie es mit einem anderen Ortsnamen.', {
              position: 'bottom-right',
              duration: 4000,
            });
          }
        },
        error: (error) => {
          console.error('Error geocoding location:', error);
          this._toast.error('Fehler beim Geocodieren des Ortes', {
            position: 'bottom-right',
            duration: 4000,
          });
        },
      });
    } else {
      // No location search, reset reference location
      if (!locationQuery) {
        this.referenceLocation = null;
      }
      this.applyClientSideFilters();
    }
  }

  // Apply client-side filters
  private applyClientSideFilters() {
    const filtered = this.filterStaffData();
    
    // For table view, pass ALL filtered data to the table component
    // The table component will handle pagination internally
    if (this.viewMode === 'table') {
      this.staffData = filtered; // Pass all filtered data, not paginated
      this.totalItems = filtered.length; // Total count for pagination display
    } else {
      // For map/grid views, use all filtered data
      this.staffData = filtered;
      this.totalItems = filtered.length;
    }
    this.debug('applyClientSideFilters', {
      viewMode: this.viewMode,
      filteredCount: filtered.length,
      pageSize: this.pageSize,
    });
  }

  private debug(label: string, payload?: any) {
    if (typeof window === 'undefined') {
      return;
    }
    const storeKey = '__staffListDebug';
    const entry = {
      label,
      payload,
      timestamp: new Date().toISOString(),
    };
    (window as any)[storeKey] = (window as any)[storeKey] || [];
    (window as any)[storeKey].push(entry);
    const logger = window.console && typeof window.console.log === 'function'
      ? window.console.log.bind(window.console)
      : null;
    if (logger) {
      logger(`[StaffList] ${label}`, payload ?? '');
    }
  }

  private performSearchWithLocationFilter() {
    // This method is now only used for initial load or when view mode changes
    // Regular searches are handled client-side
    // Create search params WITHOUT location (we'll calculate distances client-side)
    const searchParamsWithoutLocation: MerchandiserSearchParams = {
      ...this.searchParams,
      location: '', // Don't send location to API - we calculate distances client-side
      page: 1,
      // Don't include limit to fetch all data for distance calculation
    };
    delete searchParamsWithoutLocation.limit;

    this.merchandiserService.searchMerchandisers(searchParamsWithoutLocation).subscribe({
      next: (response) => {
        // Store all loaded data for client-side filtering
        this.allStaffData = this.mapMerchandisersToStaff(response.data);
        // Apply filters (which will handle distance calculation)
        this.applyClientSideFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error searching merchandisers:', error);
        this.error = 'Fehler bei der Suche';
        this.loading = false;
      },
    });
  }

  private performSearchWithoutLocationFilter() {
    // This method is now only used for initial load or when view mode changes
    // Regular searches are handled client-side
    this.merchandiserService.searchMerchandisers(this.searchParams).subscribe({
      next: (response) => {
        this.debug('search response', {
          responseKeys: Object.keys(response),
          loaded: response.data.length,
        });
        // Store all loaded data for client-side filtering
        this.allStaffData = this.mapMerchandisersToStaff(response.data);
        // Apply filters
        this.applyClientSideFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error searching merchandisers:', error);
        this.error = 'Fehler bei der Suche';
        this.loading = false;
      },
    });
  }

  // Handle pagination change from table/grid component
  onPageChange(event: { first: number; rows: number }): void {
    this.first = event.first;
    this.pageSize = event.rows;
    this.currentPage = Math.floor(event.first / event.rows) + 1;
    this.debug('parent onPageChange', {
      event,
      viewMode: this.viewMode,
      first: this.first,
      rows: this.pageSize,
      currentPage: this.currentPage,
    });
    
    // All pagination is now client-side - no API calls needed
    // The table component handles pagination internally on the filtered data
    // Just update the pagination state for display purposes
    this.debug('pagination state updated', { first: this.first, rows: this.pageSize, currentPage: this.currentPage });
  }

  onSearchInputChange(field: keyof Pick<MerchandiserSearchParams, 'name' | 'location' | 'clientAssignment' | 'customFilter'>, event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchParams[field] = target.value;

    // For location search, we need geocoding for new locations
    if (field === 'location') {
      const locationValue = this.searchParams.location?.trim() || '';
      
      // If location is cleared, filter immediately
      if (!locationValue) {
        this.referenceLocation = null;
        if (this.allStaffData.length > 0) {
          this.applyClientSideFilters();
        }
        // Update query parameters
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: this.getNavigationQueryParams(),
          queryParamsHandling: 'merge',
        });
      } else {
        // For new location input, use onSearch() to handle geocoding
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
          this.onSearch();
        }, 500);
      }
    } else {
      // For other fields, apply filters immediately (client-side filtering)
      if (this.allStaffData.length > 0) {
        this.applyClientSideFilters();
      }

      // Update query parameters with minimal debounce for URL updates
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: this.getNavigationQueryParams(),
          queryParamsHandling: 'merge',
        });
      }, 300);
    }
  }

  onQualificationChange(event: any): void {
    const selectedJobType = event.value;
    this.selectedQualification = selectedJobType;
    this.searchParams.qualifications = selectedJobType || '';
    
    // Apply filters immediately (client-side filtering)
    if (this.allStaffData.length > 0) {
      this.applyClientSideFilters();
    }
    
    // Update query parameters - explicitly remove if cleared
    if (!selectedJobType) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { qualifications: null },
        queryParamsHandling: 'merge',
      });
    } else {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.getNavigationQueryParams(),
        queryParamsHandling: 'merge',
      });
    }
  }

  onQualificationModelChange(value: string | null): void {
    // This handles the case when the clear button is clicked
    // ngModelChange fires when the model value changes, including when cleared
    if (value === null || value === undefined || value === '') {
      this.selectedQualification = null;
      this.searchParams.qualifications = '';
      
      // Apply filters immediately (client-side filtering)
      if (this.allStaffData.length > 0) {
        this.applyClientSideFilters();
      }
      
      // Remove from query parameters explicitly
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { qualifications: null },
        queryParamsHandling: 'merge',
      });
    }
  }

  onStatusModelChange(value: string | null): void {
    // This handles the case when the clear button is clicked
    // ngModelChange fires when the model value changes, including when cleared
    if (value === null || value === undefined || value === '') {
      this.selectedStatus = null;
      this.searchParams.status = '';
      
      // Apply filters immediately (client-side filtering)
      if (this.allStaffData.length > 0) {
        this.applyClientSideFilters();
      }
      
      // Remove from query parameters explicitly
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { status: null },
        queryParamsHandling: 'merge',
      });
    }
  }

  onStatusChange(event: any): void {
    const selectedStatus = event.value;
    this.selectedStatus = selectedStatus;
    this.searchParams.status = selectedStatus || '';
    
    // Apply filters immediately (client-side filtering)
    if (this.allStaffData.length > 0) {
      this.applyClientSideFilters();
    }
    
    // Update query parameters - explicitly remove if cleared
    if (!selectedStatus) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { status: null },
        queryParamsHandling: 'merge',
      });
    } else {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: this.getNavigationQueryParams(),
        queryParamsHandling: 'merge',
      });
    }
  }

  clearQualification(): void {
    this.selectedQualification = null;
    this.searchParams.qualifications = '';
    this.onSearch();
  }

  clearNameSearch(): void {
    this.searchParams.name = '';
    // Apply filters immediately
    this.applyClientSideFilters();
    // Remove from query parameters explicitly by setting to null
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { name: null },
      queryParamsHandling: 'merge',
    });
  }

  clearLocationSearch(): void {
    this.searchParams.location = '';
    this.referenceLocation = null;
    // Apply filters immediately
    this.applyClientSideFilters();
    // Remove from query parameters explicitly by setting to null
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { location: null },
      queryParamsHandling: 'merge',
    });
  }

  clearClientAssignment(): void {
    this.searchParams.clientAssignment = '';
    // Apply filters immediately
    this.applyClientSideFilters();
    // Remove from query parameters explicitly by setting to null
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { clientAssignment: null },
      queryParamsHandling: 'merge',
    });
  }

  clearCustomFilter(): void {
    this.searchParams.customFilter = '';
    // Apply filters immediately
    this.applyClientSideFilters();
    // Remove from query parameters explicitly by setting to null
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { customFilter: null },
      queryParamsHandling: 'merge',
    });
  }

  clearStatus(): void {
    this.selectedStatus = null;
    this.searchParams.status = '';
    this.onSearch();
  }

  /**
   * Handle favorite toggle with backend call (similar to clients component)
   */
  onFavoriteChanged(event: { newStatus: boolean; staff: any }): void {
    const { newStatus, staff } = event;
    this.debug('toggle favorite start', { id: staff.id, newStatus });

    // Optimistically update the UI
    const previousStatus = staff.isFavorite;
    staff.isFavorite = newStatus;

    // Call backend to toggle favorite status
    this.merchandiserService
      .toggleFavoriteStatus(parseInt(staff.id))
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling favorite status:', error);

          // Revert the optimistic update on error
          staff.isFavorite = previousStatus;

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
            this.debug('toggle favorite success', result);

            // Update the status based on server response (in case of any discrepancy)
            staff.isFavorite = result.isFavorite;

            this._toast.success(result.message, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }

  private hasSearchCriteria(): boolean {
    const { page, limit, ...searchFields } = this.searchParams;
    return Object.values(searchFields).some((value) => value && value.toString().trim().length > 0);
  }

  private mapMerchandisersToStaff(merchandisers: any[]): Staff[] {
    return merchandisers.map((merchandiser) => ({
      id: merchandiser.id.toString(),
      firstName: merchandiser.user?.firstName || '',
      lastName: merchandiser.user?.lastName || '',
      email: merchandiser.user?.email || '', // Now available in the API response
      phone: merchandiser.user?.phone || '',
      address: merchandiser.street || '',
      postalCode: merchandiser.zipCode || '',
      city: merchandiser.city?.name || '', // Using city name
      country: merchandiser.city?.country?.name?.de || merchandiser.nationality || '',
      distance: this.calculateDistance(merchandiser.city?.coordinates), // Calculate from coordinates
      qualifications: merchandiser.jobTypes?.map((job) => job.name) || [],
      portrait: merchandiser.portrait,
      dateOfBirth: this.formatDate(merchandiser.birthday),
      status: merchandiser.status?.name || '', // Default status if not available
      isFavorite: merchandiser.isFavorite || false, // Add favorite status from API
      location: this.extractLocation(merchandiser.city?.coordinates), // Extract from coordinates array
      clientCompanies: merchandiser.clientCompanies || [], // Map client companies
    }));
  }

  private extractLocation(coordinates: number[]): { lat: number; lng: number } | undefined {
    if (coordinates && coordinates.length >= 2) {
      return {
        lat: coordinates[0], // First element is latitude
        lng: coordinates[1], // Second element is longitude
      };
    }
    return undefined;
  }

  /**
   * Geocode location name to coordinates using OpenStreetMap Nominatim API
   * (Free alternative to Mapbox)
   */
  private geocodeLocation(locationName: string): Observable<{ lat: number; lng: number } | null> {
    const url = 'https://nominatim.openstreetmap.org/search';
    const params = new URLSearchParams({
      q: locationName,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    });

    // Use header to respect Nominatim usage policy
    const headers = new HttpHeaders({
      'User-Agent': 'Akzente-Application/1.0',
    });

    // Create context to skip API prefix and auth interceptors for external request
    const context = new HttpContext().set(SKIP_API_PREFIX, true).set(SKIP_AUTH_CHECK, true);

    return this.http.get<any[]>(`${url}?${params.toString()}`, { headers, context }).pipe(
      map((results: any[]) => {
        if (results && results.length > 0) {
          const result = results[0];
          return {
            lat: parseFloat(result.lat),
            lng: parseFloat(result.lon),
          };
        }
        return null;
      }),
      catchError((error) => {
        console.error('Geocoding error:', error);
        return of(null);
      })
    );
  }

  /**
   * Calculate haversine distance between two coordinates (air distance)
   * Returns distance in kilometers as a formatted string
   */
  private calculateHaversineDistance(
    point1: { lat: number; lng: number },
    point2?: { lat: number; lng: number }
  ): string {
    if (!point2) {
      return '-- km';
    }

    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degreesToRadians(point2.lat - point1.lat);
    const dLng = this.degreesToRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(point1.lat)) *
        Math.cos(this.degreesToRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Format distance: show 0 decimal places if > 10km, 1 decimal place if > 1km, meters if < 1km
    if (distance >= 10) {
      return `${Math.round(distance)} km`;
    } else if (distance >= 1) {
      return `${distance.toFixed(1)} km`;
    } else {
      return `${(distance * 1000).toFixed(0)} m`;
    }
  }

  /**
   * Convert degrees to radians
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Parse distance string to numeric value in kilometers for sorting
   */
  private parseDistanceToKm(distanceString: string): number {
    if (distanceString === '-- km' || !distanceString) {
      return 999999; // Large number for sorting
    }

    // Extract number from strings like "123 km" or "123 m"
    const match = distanceString.match(/([\d.]+)\s*(km|m)/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      return unit === 'km' ? value : value / 1000; // Convert meters to km
    }

    return 999999;
  }

  /**
   * Calculate distance using reference location if available
   */
  private calculateDistance(coordinates?: number[]): string {
    if (!coordinates || coordinates.length < 2) {
      return '-- km';
    }

    const staffLocation = this.extractLocation(coordinates);
    if (this.referenceLocation && staffLocation) {
      return this.calculateHaversineDistance(this.referenceLocation, staffLocation);
    }

    return '-- km';
  }

  private formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
  }

  /**
   * Check if there are any active filters
   */
  hasActiveFilters(): boolean {
    // Check search params
    const hasSearchFilters = 
      (this.searchParams.name && this.searchParams.name.trim().length > 0) ||
      (this.searchParams.location && this.searchParams.location.trim().length > 0) ||
      (this.searchParams.qualifications && this.searchParams.qualifications.trim().length > 0) ||
      (this.searchParams.status && this.searchParams.status.trim().length > 0) ||
      (this.searchParams.clientAssignment && this.searchParams.clientAssignment.trim().length > 0) ||
      (this.searchParams.customFilter && this.searchParams.customFilter.trim().length > 0);

    // Check column filters in table component
    const hasColumnFilters = this.staffTableComponent?.hasStaffColumnFilters() || false;

    return hasSearchFilters || hasColumnFilters;
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    // Clear search params
    this.searchParams = {
      name: '',
      location: '',
      qualifications: '',
      status: '',
      clientAssignment: '',
      customFilter: '',
      page: 1,
      limit: 0,
    };

    // Clear dropdown selections
    this.selectedQualification = null;
    this.selectedStatus = null;

    // Clear reference location
    this.referenceLocation = null;

    // Clear column filters in table component
    if (this.staffTableComponent) {
      this.staffTableComponent.clearColumnFilters();
    }

    // Apply filters immediately (client-side filtering)
    if (this.allStaffData.length > 0) {
      this.applyClientSideFilters();
    }

    // Clear query parameters - explicitly remove all filter params
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        viewMode: this.viewMode, // Keep viewMode
        name: null,
        location: null,
        qualifications: null,
        status: null,
        clientAssignment: null,
        customFilter: null,
      },
      queryParamsHandling: 'merge',
    });
  }
}
