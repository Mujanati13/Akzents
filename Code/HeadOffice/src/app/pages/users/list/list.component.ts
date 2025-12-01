import { Component, OnInit, ViewChild, ElementRef, HostListener, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged, BehaviorSubject, combineLatest, take } from 'rxjs';
import { UsersService, User, UserQueryParams } from '../services/users.service';

interface Column {
  field: string;
  header: string;
}

export enum UserListType {
  ALL = 'all',
  AKZENTE = 'akzente',
  CLIENT = 'client',
}

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  standalone: false,
})
export class ListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private isLoading$ = new BehaviorSubject<boolean>(false);

  cols!: Column[];
  selectedColumns!: Column[];
  dateRange: Date[] = [];
  dateRange2 = { start: null, end: null };

  @ViewChild('datePickerButton') datePickerButton: ElementRef;
  @ViewChild('datePickerContent') datePickerContent: ElementRef;
  @ViewChild('usersColumnFilterPopover') usersColumnFilterPopover: any;
  isDatePickerOpen = false;

  myDate: Date | null = null;

  // User data properties
  users: User[] = [];
  selectedUser?: User | null;
  loading = false;
  totalRecords = 0;
  currentPage = 1;
  pageSize = 10;

  // Filtering and search - using BehaviorSubjects for better control
  private clientSearchSubject = new BehaviorSubject<string>('');
  private nameSearchSubject = new BehaviorSubject<string>('');
  private categorySearchSubject = new BehaviorSubject<string>('');

  // Public properties for template binding
  get clientSearch(): string {
    return this.clientSearchSubject.value;
  }
  get nameSearch(): string {
    return this.nameSearchSubject.value;
  }
  get categorySearch(): string {
    return this.categorySearchSubject.value;
  }

  // Sorting properties
  sortField: string = '';
  sortOrder: number = 1; // 1 for ascending, -1 for descending

  // Column visibility
  usersVisibleColumns: { [key: string]: boolean } = {};
  usersOrderedColumns: Column[] = [];

  // Column filter properties
  usersColumnFilters: { [key: string]: string[] } = {
    firstName: [],
    lastName: [],
    email: [],
    type: [],
    customer: [],
  };

  // Track current filter field for popovers
  currentUsersFilterField: string = '';
  private activeUsersColumnFilterPopover: any = null;

  // Flag to prevent subscription from triggering during initial filter restoration
  private isRestoringFilters = false;

  constructor(
    private usersService: UsersService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initializeColumns();
    this.restoreFiltersFromQuery();
    this.setupSearchSubscriptions();
    // Keep loader visible until the table triggers its initial lazy load
    this.loading = true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Handle date picker closing
    if (this.isDatePickerOpen) {
      const buttonEl = this.datePickerButton?.nativeElement;
      const contentEl = this.datePickerContent?.nativeElement;

      if (buttonEl && contentEl) {
        if (!buttonEl.contains(target) && !contentEl.contains(target) && this.dateRange.length === 2) {
          this.closeDatePicker();
        }
      }
    }
    
    // Handle popover closing
    // Check if click is inside a popover panel
    const isClickInsidePopover = target.closest('.p-popover') !== null || 
                                 target.closest('[data-pc-section="content"]') !== null;
    
    // Check if click is on a filter icon (SVG with filter icon)
    const isClickOnFilterIcon = target.closest('svg[stroke="currentColor"]') !== null &&
                                 target.closest('svg[stroke="currentColor"]')?.closest('.cursor-pointer') !== null;
    
    // Check if click is on PrimeNG multiselect or dropdown
    const isClickOnPrimeComponent = target.closest('p-multiselect') !== null ||
                    target.closest('p-dropdown') !== null ||
                    target.closest('.p-multiselect') !== null ||
                    target.closest('.p-dropdown') !== null ||
                    target.closest('.p-multiselect-panel') !== null ||
                    target.closest('.p-dropdown-panel') !== null;
    
    // If click is not inside popover, not on filter icon, and not on PrimeNG component, close all popovers
    if (!isClickInsidePopover && !isClickOnFilterIcon && !isClickOnPrimeComponent) {
      this.closeAllFilterPopovers();
    }
  }

  private initializeColumns(): void {
    this.cols = [
      { field: 'lastName', header: 'Nachname' },
      { field: 'email', header: 'E-Mail' },
      { field: 'type', header: 'Kategorie' },
      { field: 'customer', header: 'Kunde' },
    ];

    this.usersOrderedColumns = [...this.cols];
    this.initializeVisibleColumns();
    this.selectedColumns = this.cols;
  }

  private restoreFiltersFromQuery(): void {
    this.isRestoringFilters = true;
    this.route.queryParams.pipe(take(1)).subscribe((params) => {
      // Restore search terms
      if (params['clientSearch']) {
        this.clientSearchSubject.next(params['clientSearch']);
      }
      if (params['nameSearch']) {
        this.nameSearchSubject.next(params['nameSearch']);
      }
      if (params['categorySearch']) {
        this.categorySearchSubject.next(params['categorySearch']);
      }

      // Restore column filters
      if (params['firstNameFilter']) {
        this.usersColumnFilters['firstName'] = Array.isArray(params['firstNameFilter']) 
          ? params['firstNameFilter'] 
          : [params['firstNameFilter']];
      }
      if (params['lastNameFilter']) {
        this.usersColumnFilters['lastName'] = Array.isArray(params['lastNameFilter']) 
          ? params['lastNameFilter'] 
          : [params['lastNameFilter']];
      }
      if (params['emailFilter']) {
        this.usersColumnFilters['email'] = Array.isArray(params['emailFilter']) 
          ? params['emailFilter'] 
          : [params['emailFilter']];
      }
      if (params['typeFilter']) {
        this.usersColumnFilters['type'] = Array.isArray(params['typeFilter']) 
          ? params['typeFilter'] 
          : [params['typeFilter']];
      }
      if (params['customerFilter']) {
        this.usersColumnFilters['customer'] = Array.isArray(params['customerFilter']) 
          ? params['customerFilter'] 
          : [params['customerFilter']];
      }

      // Reset flag after restoration
      setTimeout(() => {
        this.isRestoringFilters = false;
      }, 100);
    });
  }

  private updateQueryParams(): void {
    const queryParams: any = {};

    // Add search terms
    if (this.clientSearchSubject.value) {
      queryParams['clientSearch'] = this.clientSearchSubject.value;
    }
    if (this.nameSearchSubject.value) {
      queryParams['nameSearch'] = this.nameSearchSubject.value;
    }
    if (this.categorySearchSubject.value) {
      queryParams['categorySearch'] = this.categorySearchSubject.value;
    }

    // Add column filters
    if (this.usersColumnFilters['firstName'] && this.usersColumnFilters['firstName'].length > 0) {
      queryParams['firstNameFilter'] = this.usersColumnFilters['firstName'];
    }
    if (this.usersColumnFilters['lastName'] && this.usersColumnFilters['lastName'].length > 0) {
      queryParams['lastNameFilter'] = this.usersColumnFilters['lastName'];
    }
    if (this.usersColumnFilters['email'] && this.usersColumnFilters['email'].length > 0) {
      queryParams['emailFilter'] = this.usersColumnFilters['email'];
    }
    if (this.usersColumnFilters['type'] && this.usersColumnFilters['type'].length > 0) {
      queryParams['typeFilter'] = this.usersColumnFilters['type'];
    }
    if (this.usersColumnFilters['customer'] && this.usersColumnFilters['customer'].length > 0) {
      queryParams['customerFilter'] = this.usersColumnFilters['customer'];
    }

    // Update URL without reloading
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : null,
      queryParamsHandling: 'merge',
    });
  }

  private setupSearchSubscriptions(): void {
    // Combine all search inputs and debounce them together
    combineLatest([this.clientSearchSubject.pipe(distinctUntilChanged()), this.nameSearchSubject.pipe(distinctUntilChanged()), this.categorySearchSubject.pipe(distinctUntilChanged())])
      .pipe(
        debounceTime(300), // Only debounce once for all inputs
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        // Skip if we're currently restoring filters (to avoid double loading)
        if (this.isRestoringFilters) {
          return;
        }
        // Reset to first page when searching
        this.currentPage = 1;
        this.updateQueryParams(); // Update URL with current filters
        this.loadUsers();
      });
  }

  loadUsers(): void {
    // Prevent multiple simultaneous requests
    if (this.isLoading$.value) {
      return;
    }

    // Check if user is searching for merchandiser - if so, show empty results
    const categoryValue = this.categorySearchSubject.value.trim().toLowerCase();
    if (categoryValue.includes('merchandiser') || categoryValue === 'merchandiser') {
      this.users = [];
      this.totalRecords = 0;
      this.loading = false;
      this.isLoading$.next(false);
      return;
    }

    // Check if user is searching for gibberish (no meaningful user type matches)
    // If the search term doesn't contain any known user type keywords, show empty results
    const meaningfulTerms = ['akzente', 'client', 'kunde', 'admin', 'user'];
    const hasMeaningfulTerm = meaningfulTerms.some((term) => categoryValue.includes(term));
    if (categoryValue.length > 0 && !hasMeaningfulTerm) {
      this.users = [];
      this.totalRecords = 0;
      this.loading = false;
      this.isLoading$.next(false);
      return;
    }

    this.isLoading$.next(true);
    this.loading = true;

    const queryParams = this.buildQueryParams();
    this.usersService
      .getUsers(queryParams)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.users = response.data;
          // Use totalCount from response, fallback to data length for compatibility
          this.totalRecords = response.totalCount || response.data.length;
          this.loading = false;
          this.isLoading$.next(false);
        },
        error: (error) => {
          console.error('Error loading users:', error);
          this.loading = false;
          this.isLoading$.next(false);
        },
      });
  }

  private buildQueryParams(): UserQueryParams {
    const params: UserQueryParams = {
      page: this.currentPage,
      limit: this.pageSize,
    };

    // Add sorting if specified
    if (this.sortField) {
      params.sort = [
        {
          orderBy: this.sortField as keyof User,
          order: this.sortOrder === 1 ? 'ASC' : 'DESC',
        },
      ];
    }

    // Build filters object according to API specification
    const clientSearch = this.clientSearchSubject.value;
    const nameSearch = this.nameSearchSubject.value;
    const categorySearch = this.categorySearchSubject.value;

    const filters: any = {};
    let hasFilters = false;

    // Add client company search (Kundensuche)
    if (clientSearch.trim()) {
      filters.clientCompanySearch = clientSearch.trim();
      hasFilters = true;
    }

    // Add name search (Namenssuche) - search by first name, last name, or both
    if (nameSearch.trim()) {
      filters.search = nameSearch.trim();
      hasFilters = true;
    }

    // Add category search (Kategoriesuche) - filter by user type
    if (categorySearch.trim()) {
      const categoryValue = categorySearch.trim().toLowerCase();

      // Map search terms to user types
      if (categoryValue.includes('akzente')) {
        filters.userTypeNames = ['akzente'];
        hasFilters = true;
      } else if (categoryValue.includes('client') || categoryValue.includes('kunde')) {
        filters.userTypeNames = ['client'];
        hasFilters = true;
      } else {
        // For any other search term, search in user type names
        // This will show users whose type name contains the search term
        filters.userTypeSearch = categoryValue;
        hasFilters = true;
      }
    }

    if (hasFilters) {
      params.filters = filters;
    }

    return params;
  }

  // Search methods - only update the subjects, don't call loadUsers directly
  onClientSearchChange(value: string): void {
    this.clientSearchSubject.next(value);
    // Query params will be updated by the subscription
  }

  onNameSearchChange(value: string): void {
    this.nameSearchSubject.next(value);
    // Query params will be updated by the subscription
  }

  onCategorySearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target?.value || '';
    this.categorySearchSubject.next(value);
    // Query params will be updated by the subscription
  }

  clearClientSearch(): void {
    this.clientSearchSubject.next('');
  }

  clearNameSearch(): void {
    this.nameSearchSubject.next('');
  }

  clearCategorySearch(): void {
    this.categorySearchSubject.next('');
  }

  // Add method to clear all filters
  clearFilters(): void {
    this.clientSearchSubject.next('');
    this.nameSearchSubject.next('');
    this.categorySearchSubject.next('');
    this.dateRange2 = { start: null, end: null };
    // Clear column filters
    this.usersColumnFilters = {
      firstName: [],
      lastName: [],
      email: [],
      type: [],
      customer: [],
    };
    this.currentPage = 1;
    // Update query params to clear filters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      queryParamsHandling: 'merge',
    });
    // loadUsers will be called automatically by the search subscription
  }

  // Navigate to add user page while preserving filters
  navigateToAddUser(): void {
    const queryParams = this.buildNavigationQueryParams();
    this.router.navigate(['/users/add'], { queryParams });
  }

  // Navigate to edit user page while preserving filters
  navigateToEditUser(userId: number | string): void {
    const queryParams = this.buildNavigationQueryParams();
    this.router.navigate(['/users/edit', userId], { queryParams });
  }

  // Build query parameters for navigation
  private buildNavigationQueryParams(): Record<string, any> {
    const params: Record<string, any> = {};

    // Add search terms
    if (this.clientSearchSubject.value) {
      params['clientSearch'] = this.clientSearchSubject.value;
    }
    if (this.nameSearchSubject.value) {
      params['nameSearch'] = this.nameSearchSubject.value;
    }
    if (this.categorySearchSubject.value) {
      params['categorySearch'] = this.categorySearchSubject.value;
    }

    // Add column filters
    if (this.usersColumnFilters['firstName'] && this.usersColumnFilters['firstName'].length > 0) {
      params['firstNameFilter'] = this.usersColumnFilters['firstName'];
    }
    if (this.usersColumnFilters['lastName'] && this.usersColumnFilters['lastName'].length > 0) {
      params['lastNameFilter'] = this.usersColumnFilters['lastName'];
    }
    if (this.usersColumnFilters['email'] && this.usersColumnFilters['email'].length > 0) {
      params['emailFilter'] = this.usersColumnFilters['email'];
    }
    if (this.usersColumnFilters['type'] && this.usersColumnFilters['type'].length > 0) {
      params['typeFilter'] = this.usersColumnFilters['type'];
    }
    if (this.usersColumnFilters['customer'] && this.usersColumnFilters['customer'].length > 0) {
      params['customerFilter'] = this.usersColumnFilters['customer'];
    }

    return params;
  }

  // Sorting methods
  onUserSort(field: string, event?: Event): void {
    event?.stopPropagation();

    if (this.sortField === field) {
      this.sortOrder = this.sortOrder * -1;
    } else {
      this.sortField = field;
      this.sortOrder = 1;
    }

    this.loadUsers();
  }

  // Pagination methods
  onPageChange(event: any): void {
    // Calculate page number from first record index
    this.currentPage = Math.floor(event.first / event.rows) + 1;
    this.pageSize = event.rows;
    console.log('Page change:', { currentPage: this.currentPage, pageSize: this.pageSize, event });
    this.loadUsers();
  }

  // Column management methods
  initializeVisibleColumns(): void {
    this.cols.forEach((col) => {
      this.usersVisibleColumns[col.field] = true;
    });
  }

  getUsersVisibleColumns(): Column[] {
    return this.usersOrderedColumns.filter((col) => this.usersVisibleColumns[col.field]);
  }

  onUsersColReorder(event: any): void {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      const movedColumn = this.usersOrderedColumns[event.dragIndex];
      const newOrderedColumns = [...this.usersOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);
      this.usersOrderedColumns = newOrderedColumns;
    }
  }

  onUsersColumnsChange(selectedColumns: Column[]): void {
    Object.keys(this.usersVisibleColumns).forEach((key) => {
      this.usersVisibleColumns[key] = false;
    });

    selectedColumns.forEach((col) => {
      this.usersVisibleColumns[col.field] = true;
    });

    this.selectedColumns = selectedColumns;
  }

  // Utility methods
  getUserDisplayValue(user: User, field: string): string {
    switch (field) {
      case 'role':
        return user.role?.name || '-';
      case 'status':
        return user.status?.name || '-';
      case 'type':
        return user.type?.name || '-';
      case 'fullName':
        return `${user.firstName || ''} ${user.lastName || ''}`.trim();
      default:
        return (user as any)[field] || '-';
    }
  }

  getUserStatusSeverity(status: string): string {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'danger';
      case 'pending':
        return 'warn';
      default:
        return 'info';
    }
  }

  /**
   * Get client companies for display in the table
   */
  getUserClientCompanies(user: User): string {
    // For akzente users, show favorite client companies
    if (user.type?.name === 'akzente' && user.clientCompanies) {
      return user.clientCompanies.map((company) => company.name).join(', ');
    }

    // For client users, show assigned client companies
    if (user.type?.name === 'client' && user.clientCompanies) {
      return user.clientCompanies.map((company) => company.name).join(', ');
    }

    // For other user types or empty arrays, return dash
    return '-';
  }

  // Date picker methods
  toggleDatePicker(): void {
    this.isDatePickerOpen = !this.isDatePickerOpen;
  }

  closeDatePicker(): void {
    this.isDatePickerOpen = false;
  }

  onDateRangeSelect(event: any): void {
    if (this.dateRange.length === 2) {
      setTimeout(() => this.closeDatePicker(), 200);
    }
  }

  onDateSelected(date: Date): void {
    console.log('Selected date:', date);
    this.myDate = date;
  }

  onRangeSelected(range: { start: Date | null; end: Date | null }): void {
    console.log('Selected range:', range);
  }

  // Column filter methods
  getUsersFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.users.forEach((user) => {
      let value: string = '';
      switch (field) {
        case 'firstName':
          value = user.firstName || '';
          break;
        case 'lastName':
          value = user.lastName || '';
          break;
        case 'email':
          value = user.email || '';
          break;
        case 'type':
          value = user.type?.name || '';
          break;
        case 'customer':
          value = this.getUserClientCompanies(user);
          break;
      }
      if (value && value !== '-') {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  getUsersColumnFilterValue(field: string): string[] {
    const filter = this.usersColumnFilters[field];
    return (filter && Array.isArray(filter)) ? filter : [];
  }

  /**
   * Close all filter popovers
   */
  closeAllFilterPopovers(): void {
    if (this.usersColumnFilterPopover) {
      this.usersColumnFilterPopover.hide();
    }
    this.activeUsersColumnFilterPopover = null;
  }

  private showUsersColumnFilterPopover(targetElement: HTMLElement): void {
    if (!this.usersColumnFilterPopover || !targetElement) {
      return;
    }

    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;

    this.usersColumnFilterPopover.hide();
    this.activeUsersColumnFilterPopover = null;

    setTimeout(() => {
      if (this.usersColumnFilterPopover) {
        this.usersColumnFilterPopover.show(positioningEvent);
        this.activeUsersColumnFilterPopover = this.usersColumnFilterPopover;
      }
    }, 120);
  }

  openUsersColumnFilter(field: string, event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    // Close all other popovers first
    this.closeAllFilterPopovers();
    
    this.currentUsersFilterField = field;
    // Initialize filter values if not exists
    if (!this.usersColumnFilters[field]) {
      this.usersColumnFilters[field] = [];
    }
    event.stopPropagation();

    if (targetElement) {
      this.showUsersColumnFilterPopover(targetElement);
    }
  }

  // Method to handle column filter changes and update query params
  onUsersColumnFilterChange(): void {
    this.updateQueryParams();
  }

  hasUsersColumnFilters(): boolean {
    return Object.values(this.usersColumnFilters).some(filters => filters && Array.isArray(filters) && filters.length > 0);
  }

  getFilteredUsers(): User[] {
    return this.users.filter((user) => {
      // Filter by firstName
      const firstNameFilter = this.usersColumnFilters['firstName'];
      if (firstNameFilter && Array.isArray(firstNameFilter) && firstNameFilter.length > 0 && !firstNameFilter.includes(user.firstName || '')) {
        return false;
      }
      // Filter by lastName
      const lastNameFilter = this.usersColumnFilters['lastName'];
      if (lastNameFilter && Array.isArray(lastNameFilter) && lastNameFilter.length > 0 && !lastNameFilter.includes(user.lastName || '')) {
        return false;
      }
      // Filter by email
      const emailFilter = this.usersColumnFilters['email'];
      if (emailFilter && Array.isArray(emailFilter) && emailFilter.length > 0 && !emailFilter.includes(user.email || '')) {
        return false;
      }
      // Filter by type
      const typeFilter = this.usersColumnFilters['type'];
      if (typeFilter && Array.isArray(typeFilter) && typeFilter.length > 0 && !typeFilter.includes(user.type?.name || '')) {
        return false;
      }
      // Filter by customer
      const customerFilter = this.usersColumnFilters['customer'];
      const customerValue = this.getUserClientCompanies(user);
      if (customerFilter && Array.isArray(customerFilter) && customerFilter.length > 0 && !customerFilter.includes(customerValue)) {
        return false;
      }
      return true;
    });
  }

  // Get column header for a field
  getColumnHeader(field: string): string {
    const col = this.cols.find(c => c.field === field);
    return col ? col.header : field;
  }

  // Get placeholder text for filter
  getFilterPlaceholder(field: string): string {
    const header = this.getColumnHeader(field);
    return `Alle ${header}`;
  }
}
