import { Component, Input, Output, EventEmitter, ViewChild, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';
import { PopoverModule } from 'primeng/popover';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { RatingModule } from 'primeng/rating';
import { AppIconComponent } from '@app/shared/app-icon.component';
import { FavoriteToggleComponent } from '@app/shared/components/favorite-toggle/favorite-toggle.component';
import { ActivatedRoute, Router } from '@angular/router';

interface Column {
  field: string;
  header: string;
}

@Component({
  selector: 'app-staff-table',
  standalone: true,
  imports: [CommonModule, RouterModule, TableModule, PaginatorModule, PopoverModule, MultiSelectModule, TagModule, RatingModule, FormsModule, AppIconComponent, FavoriteToggleComponent],
  templateUrl: './staff-table.component.html',
  styleUrls: ['./staff-table.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class StaffTableComponent {
  @Input() staffData: any[] = [];
  @Input() cols: any[] = [];
  @Input() selectedColumns: any[] = [];
  @Input() expandedRows: any = {};
  @Input() first: number = 0;
  @Input() totalRecords: number = 0;
  @Input() rows: number = 8; // Default to 8 rows per page
  @Input() loading: boolean = false; // Loading state
  
  // Pagination options
  rowsPerPageOptions: number[] = [8, 10, 20, 50, 100];
  
  // Computed total for pagination (reactive)
  get totalFilteredRecords(): number {
    return this.getFilteredStaffData().length;
  }

  // Add output event for favorite changes
  @Output() favoriteChange = new EventEmitter<{ newStatus: boolean; staff: any }>();

  // Output event for filter changes
  @Output() filterChange = new EventEmitter<void>();

  // Emit pagination change event
  @Output() pageChange = new EventEmitter<{ first: number; rows: number }>();

  // Add these properties for sorting
  sortField: string = '';
  sortOrder: number = 1; // 1 for ascending, -1 for descending

  // Add these properties to track column order and visibility
  staffOrderedColumns: Column[] = [];
  staffVisibleColumns: { [key: string]: boolean } = {};

  // Column filter properties
  staffColumnFilters: { [key: string]: string[] } = {
    lastName: [],
    email: [],
    phone: [],
    address: [],
    city: [],
    distance: [],
    qualifications: [],
    status: [],
  };

  // Track current filter field for popovers
  currentStaffFilterField: string = '';

  @ViewChild('staffSettingsPopover') staffSettingsPopover: any;
  @ViewChild('staffColumnFilterPopover') staffColumnFilterPopover: any;
  private activeStaffColumnFilterPopover: any = null;
  private activeSettingsPopover: any = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: any) {
    // Initialize ordered columns when input properties change
    if (this.cols && this.cols.length > 0 && this.staffOrderedColumns.length === 0) {
      this.staffOrderedColumns = [...this.cols];
      this.initializeVisibleColumns();
    }
    
    // Sync first when parent updates it (for state synchronization)
    if (changes.first && changes.first.currentValue !== undefined) {
      // Only update if it's different to avoid infinite loops
      if (this.first !== changes.first.currentValue) {
        this.first = changes.first.currentValue;
      }
    }
    
    // Sync rows when parent updates it
    if (changes.rows && changes.rows.currentValue !== undefined) {
      if (this.rows !== changes.rows.currentValue) {
        this.rows = changes.rows.currentValue;
      }
    }
    
    // Log when totalRecords changes
    if (changes.totalRecords) {
      console.log('📊 Table component - totalRecords changed:', changes.totalRecords.currentValue, 'Previous:', changes.totalRecords.previousValue);
      // Force change detection to ensure PrimeNG table updates
      this.cdr.markForCheck();
    }
    
    // Log all input changes for debugging
    if (changes.staffData) {
      console.log('📊 Table component - staffData changed, length:', changes.staffData.currentValue?.length);
    }
  }

  // Initialize visible columns
  initializeVisibleColumns() {
    this.cols.forEach((col) => {
      this.staffVisibleColumns[col.field] = true;
    });
    // Explicitly set status to false by default
    this.staffVisibleColumns['status'] = false;
  }

  // Get visible columns in their current order
  getStaffVisibleColumns(): Column[] {
    return this.staffOrderedColumns.filter((col) => this.staffVisibleColumns[col.field]);
  }

  // Handle column reordering
  onColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.staffOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.staffOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.staffOrderedColumns = newOrderedColumns;
    }
  }

  // Update visible columns when selection changes in multiselect
  onColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.staffVisibleColumns).forEach((key) => {
      this.staffVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.staffVisibleColumns[col.field] = true;
    });

    // Update the selectedColumns for backward compatibility
    this.selectedColumns = selectedColumns;
  }

  // Existing methods...
  onFavoriteChanged(newStatus: boolean, staff: any): void {
    // Emit the event to parent component to handle the API call
    this.favoriteChange.emit({ newStatus, staff });
  }

  getSeverity(status: string): string {
    switch (status) {
      case 'Team':
        return 'success';
      case 'Out':
        return 'danger';
      case 'Neu':
        return 'info';
      default:
        return 'warning';
    }
  }

  getNavigationQueryParams(): Record<string, any> {
    const queryParams = { ...this.route.snapshot.queryParams };
    // Ensure viewMode is set (default to 'table' for table view)
    if (!queryParams['viewMode']) {
      queryParams['viewMode'] = 'table';
    }
    return queryParams;
  }

  // Add these methods for sorting functionality
  onSort(field: string, event?: Event): void {
    // Prevent event propagation to avoid triggering other handlers
    event?.stopPropagation();

    if (this.sortField === field) {
      // If clicking on the same field, toggle the sort order
      this.sortOrder = this.sortOrder * -1;
    } else {
      // New sort field, default to ascending
      this.sortField = field;
      this.sortOrder = 1;
    }

    // Apply sorting
    this.sortStaffData(field, this.sortOrder);
  }

  private sortStaffData(field: string, order: number): void {
    this.staffData.sort((a, b) => {
      const valueA = this.getStaffField(a, field);
      const valueB = this.getStaffField(b, field);

      if (valueA === valueB) {
        return 0;
      }

      // Handle arrays (like qualifications)
      if (Array.isArray(valueA) && Array.isArray(valueB)) {
        const stringA = valueA.join('');
        const stringB = valueB.join('');
        return order * stringA.localeCompare(stringB);
      }

      // Handle string case-insensitive comparison
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order * valueA.localeCompare(valueB);
      }

      // Handle numeric comparison
      if (valueA < valueB) {
        return order * -1;
      }
      return order;
    });
  }

  private getStaffField(staff: any, field: string): any {
    if (field === 'firstName') {
      return staff.firstName || '';
    }

    if (field === 'qualifications') {
      return staff.qualifications || [];
    }

    return staff[field] || '';
  }

  // Column filter methods
  getStaffFilterOptions(field: string): string[] {
    const values = new Set<string>();
    this.staffData.forEach((staff) => {
      let value: string = '';
      switch (field) {
        case 'lastName':
          value = staff.lastName || '';
          break;
        case 'email':
          value = staff.email || '';
          break;
        case 'phone':
          value = staff.phone || '';
          break;
        case 'address':
          value = staff.address || '';
          break;
        case 'city':
          value = staff.city || '';
          break;
        case 'distance':
          value = staff.distance || '';
          break;
        case 'qualifications':
          value = Array.isArray(staff.qualifications) ? staff.qualifications.join(', ') : '';
          break;
        case 'status':
          value = staff.status || '';
          break;
      }
      if (value && value !== '-') {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  }

  getStaffColumnFilterValue(field: string): string[] {
    return this.staffColumnFilters[field] || [];
  }

  openStaffColumnFilter(field: string, event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    this.currentStaffFilterField = field;
    event.stopPropagation();

    this.hideSettingsPopover();
    this.showStaffColumnFilterPopover(targetElement);
  }

  private showStaffColumnFilterPopover(targetElement: HTMLElement): void {
    if (!this.staffColumnFilterPopover || !targetElement) {
      return;
    }

    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;

    this.staffColumnFilterPopover.hide();
    this.activeStaffColumnFilterPopover = null;

    setTimeout(() => {
      if (this.staffColumnFilterPopover) {
        this.staffColumnFilterPopover.show(positioningEvent);
        this.activeStaffColumnFilterPopover = this.staffColumnFilterPopover;
      }
    }, 120);
  }

  toggleStaffSettingsPopover(event: Event): void {
    this.toggleSettingsPopover(this.staffSettingsPopover, event);
  }

  onStaffSettingsPopoverClose(event?: Event): void {
    event?.stopPropagation();
    this.hideSettingsPopover();
  }

  private toggleSettingsPopover(popoverRef: any, event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!popoverRef || !targetElement) {
      return;
    }

    event.stopPropagation();

    if (this.activeSettingsPopover === popoverRef) {
      popoverRef.hide();
      this.activeSettingsPopover = null;
      return;
    }

    this.staffColumnFilterPopover?.hide();
    this.activeStaffColumnFilterPopover = null;
    this.hideSettingsPopover(popoverRef);

    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;

    popoverRef.hide();

    setTimeout(() => {
      popoverRef.show(positioningEvent);
      this.activeSettingsPopover = popoverRef;
    }, 120);
  }

  private hideSettingsPopover(except?: any): void {
    if (this.staffSettingsPopover && this.staffSettingsPopover !== except) {
      this.staffSettingsPopover.hide();
    }

    if (!except || (this.activeSettingsPopover && this.activeSettingsPopover !== except)) {
      this.activeSettingsPopover = null;
    }
  }

  hasStaffColumnFilters(): boolean {
    return Object.values(this.staffColumnFilters).some(filters => filters.length > 0);
  }

  getFilteredStaffData(): any[] {
    // Apply column filters to all staff data
    return this.staffData.filter((staff) => {
      // Filter by lastName
      if (this.staffColumnFilters['lastName'].length > 0 && !this.staffColumnFilters['lastName'].includes(staff.lastName || '')) {
        return false;
      }
      // Filter by email
      if (this.staffColumnFilters['email'].length > 0 && !this.staffColumnFilters['email'].includes(staff.email || '')) {
        return false;
      }
      // Filter by phone
      if (this.staffColumnFilters['phone'].length > 0 && !this.staffColumnFilters['phone'].includes(staff.phone || '')) {
        return false;
      }
      // Filter by address
      if (this.staffColumnFilters['address'].length > 0 && !this.staffColumnFilters['address'].includes(staff.address || '')) {
        return false;
      }
      // Filter by city
      if (this.staffColumnFilters['city'].length > 0 && !this.staffColumnFilters['city'].includes(staff.city || '')) {
        return false;
      }
      // Filter by distance
      if (this.staffColumnFilters['distance'].length > 0 && !this.staffColumnFilters['distance'].includes(staff.distance || '')) {
        return false;
      }
      // Filter by qualifications
      if (this.staffColumnFilters['qualifications'].length > 0) {
        const staffQualifications = Array.isArray(staff.qualifications) ? staff.qualifications.join(', ') : '';
        if (!this.staffColumnFilters['qualifications'].some(filter => staffQualifications.includes(filter))) {
          return false;
        }
      }
      // Filter by status
      if (this.staffColumnFilters['status'].length > 0 && !this.staffColumnFilters['status'].includes(staff.status || '')) {
        return false;
      }
      return true;
    });
  }

  // Get paginated staff data (filtered + paginated)
  getPaginatedStaffData(): any[] {
    const filtered = this.getFilteredStaffData();
    const startIndex = this.first;
    const endIndex = this.first + this.rows;
    return filtered.slice(startIndex, endIndex);
  }


  // Handle pagination event
  onPageChange(event: any): void {
    // Update internal pagination state for tracking
    this.first = event.first;
    this.rows = event.rows;
    
    // Force change detection to update the table
    this.cdr.markForCheck();
    
    // Also emit to parent for state synchronization (parent won't make API calls)
    this.pageChange.emit({ first: event.first, rows: event.rows });
    
    console.log('📊 Table pagination changed:', { first: event.first, rows: event.rows, totalFiltered: this.getFilteredStaffData().length });
  }

  // Handle filter change
  onFilterChange(): void {
    // When column filters change, reset to first page
    this.first = 0;
    // Force change detection to update pagination
    this.cdr.markForCheck();
    this.pageChange.emit({ first: 0, rows: this.rows });
    this.filterChange.emit();
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

  // Clear all column filters
  clearColumnFilters(): void {
    this.staffColumnFilters = {
      lastName: [],
      email: [],
      phone: [],
      address: [],
      city: [],
      distance: [],
      qualifications: [],
      status: [],
    };
    // Reset to first page when clearing filters
    this.first = 0;
    this.pageChange.emit({ first: 0, rows: this.rows });
  }
}
