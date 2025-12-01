import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AppIconComponent } from '@app/shared/app-icon.component';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EuDatePipe } from '@app/shared/pipes/eu-date.pipe';
import { MerchandiserService } from '@app/core/services/merchandiser.service';
import { PaginatorModule } from 'primeng/paginator';

@Component({
  selector: 'app-staff-grid',
  standalone: true,
  imports: [CommonModule, RouterModule, AppIconComponent, FormsModule, EuDatePipe, PaginatorModule],
  templateUrl: './staff-grid.component.html',
})
export class StaffGridComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() staffData: any[] = [];
  @Input() rows: number = 8; // Default to 8 rows per page
  @Input() loading: boolean = false; // Loading state
  
  @Output() pageChange = new EventEmitter<{ first: number; rows: number }>();
  @Output() favoriteChange = new EventEmitter<{ newStatus: boolean; staff: any }>();
  
  @ViewChild('paginator') paginator: any;

  filteredStaffData: any[] = [];
  paginatedData: any[] = [];
  first: number = 0;
  totalRecords: number = 0;

  // Filter state with dynamic qualifications and status
  filters = {
    firstName: '',
    lastName: '',
    address: '',
    country: '',
    distance: '',
    qualifications: {} as Record<string, boolean>,
    status: {} as Record<string, boolean>,
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private merchandiserService: MerchandiserService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadFilterOptions();
    this.filteredStaffData = [...this.staffData];
    this.updatePaginatedData();
    this.debug('init', {
      staffDataLength: this.staffData.length,
      rows: this.rows,
      first: this.first,
    });
  }

  ngAfterViewInit() {
    // Manually attach event listener to paginator since onPage event doesn't fire reliably
    setTimeout(() => {
      if (this.paginator && this.paginator.el) {
        const paginatorElement = this.paginator.el.nativeElement;
        paginatorElement.addEventListener('click', (e: any) => {
          const target = e.target.closest('button');
          if (target && (
            target.classList.contains('p-paginator-page') || 
            target.classList.contains('p-paginator-first') ||
            target.classList.contains('p-paginator-prev') ||
            target.classList.contains('p-paginator-next') ||
            target.classList.contains('p-paginator-last') ||
            target.classList.contains('p-paginator-rpp-options')
          )) {
            console.log('🧪 Paginator button clicked:', target.className);
            // Small delay to let PrimeNG update its internal state
            setTimeout(() => {
              const newFirst = this.paginator.first !== undefined ? this.paginator.first : this.first;
              const newRows = this.paginator.rows !== undefined ? this.paginator.rows : this.rows;
              console.log('🧪 Checking pagination change:', {
                oldFirst: this.first,
                newFirst,
                oldRows: this.rows,
                newRows,
              });
              if (newFirst !== this.first || newRows !== this.rows) {
                console.log('🧪 Triggering onPageChange manually');
                this.onPageChange({ first: newFirst, rows: newRows });
              }
            }, 50);
          }
        });
        this.debug('afterViewInit', { paginatorFound: !!this.paginator });
      }
    }, 100);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['staffData']) {
      this.filteredStaffData = [...this.staffData];
      this.first = 0; // Reset to first page when data changes
      this.updatePaginatedData();
      this.debug('staffData changed', {
        newLength: this.staffData.length,
        first: this.first,
        rows: this.rows,
      });
    }
    if (changes['rows']) {
      this.updatePaginatedData();
    }
  }

  private loadFilterOptions() {
    this.merchandiserService.getFilterOptions().subscribe({
      next: (response) => {
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

        console.log('✅ Grid filter options loaded:', {
          qualifications: Object.keys(this.filters.qualifications),
          statuses: Object.keys(this.filters.status),
        });
      },
      error: (error) => {
        console.error('❌ Error loading filter options:', error);
      },
    });
  }

  applyFilters() {
    this.filteredStaffData = this.staffData.filter((staff) => {
      // Text filters
      const firstNameMatch = !this.filters.firstName || staff.firstName?.toLowerCase().includes(this.filters.firstName.toLowerCase());
      const lastNameMatch = !this.filters.lastName || staff.lastName?.toLowerCase().includes(this.filters.lastName.toLowerCase());
      const addressMatch = !this.filters.address || staff.address?.toLowerCase().includes(this.filters.address.toLowerCase());
      const countryMatch = !this.filters.country || staff.country?.toLowerCase().includes(this.filters.country.toLowerCase());
      const distanceMatch = !this.filters.distance || staff.distance?.toLowerCase().includes(this.filters.distance.toLowerCase());

      // Qualification filters - any selected qualification must be present
      let qualificationMatch = true;
      const activeQualifications = Object.keys(this.filters.qualifications).filter((q) => this.filters.qualifications[q]);
      if (activeQualifications.length > 0) {
        qualificationMatch = activeQualifications.some((qual) => staff.qualifications?.includes(qual));
      }

      // Status filters
      let statusMatch = true;
      const activeStatuses = Object.keys(this.filters.status).filter((s) => this.filters.status[s]);
      if (activeStatuses.length > 0) {
        statusMatch = activeStatuses.includes(staff.status);
      }

      return firstNameMatch && lastNameMatch && addressMatch && countryMatch && distanceMatch && qualificationMatch && statusMatch;
    });
    this.updatePaginatedData();
    this.debug('filters applied', {
      firstName: this.filters.firstName,
      lastName: this.filters.lastName,
      address: this.filters.address,
      country: this.filters.country,
      distance: this.filters.distance,
      qualifications: Object.keys(this.filters.qualifications).filter((q) => this.filters.qualifications[q]),
      status: Object.keys(this.filters.status).filter((s) => this.filters.status[s]),
      resultCount: this.filteredStaffData.length,
    });
  }

  updatePaginatedData() {
    // Apply client-side pagination to filtered data
    const startIndex = this.first;
    const endIndex = startIndex + this.rows;
    this.paginatedData = this.filteredStaffData.slice(startIndex, endIndex);
    this.totalRecords = this.filteredStaffData.length;
    this.debug('pagination updated', {
      startIndex,
      endIndex,
      rows: this.rows,
      filteredTotal: this.totalRecords,
      pageLength: this.paginatedData.length,
      paginatedDataIds: this.paginatedData.map(s => s.id),
    });
    // Force change detection to ensure view updates
    this.cdr.markForCheck();
  }

  onPageChange(event: any): void {
    this.debug('onPageChange called', { event });
    console.log('🧮 Grid onPageChange - Event received:', event);
    console.log('🧮 Grid onPageChange - Before update:', {
      first: this.first,
      rows: this.rows,
      paginatedDataLength: this.paginatedData.length,
      filteredStaffDataLength: this.filteredStaffData.length,
    });
    
    this.first = event.first;
    this.rows = event.rows;
    
    console.log('🧮 Grid onPageChange - After setting values:', {
      first: this.first,
      rows: this.rows,
    });
    
    this.updatePaginatedData();
    
    console.log('🧮 Grid onPageChange - After updatePaginatedData:', {
      paginatedDataLength: this.paginatedData.length,
      paginatedDataIds: this.paginatedData.map(s => s.id),
    });
    
    this.debug('page change event', {
      event,
      newFirst: this.first,
      newRows: this.rows,
      paginatedDataLength: this.paginatedData.length,
    });
    
    this.pageChange.emit({ first: this.first, rows: this.rows });
  }

  private debug(label: string, payload?: any) {
    if (typeof window === 'undefined') {
      return;
    }
    const storeKey = '__staffGridDebug';
    const entry = {
      label,
      payload,
      timestamp: new Date().toISOString(),
    };
    (window as any)[storeKey] = (window as any)[storeKey] || [];
    (window as any)[storeKey].push(entry);
    const logger = window.console && window.console.log ? window.console.log.bind(window.console) : null;
    if (logger) {
      logger(`[StaffGrid] ${label}`, payload ?? '');
    }
  }

  toggleQualification(qual: string) {
    this.filters.qualifications[qual] = !this.filters.qualifications[qual];
    this.first = 0; // Reset to first page when filter changes
    this.applyFilters();
  }

  toggleStatus(status: string) {
    this.filters.status[status] = !this.filters.status[status];
    this.first = 0; // Reset to first page when filter changes
    this.applyFilters();
  }

  resetQualifications() {
    Object.keys(this.filters.qualifications).forEach((key) => {
      this.filters.qualifications[key] = false;
    });
    this.first = 0; // Reset to first page when filter changes
    this.applyFilters();
  }

  resetStatus() {
    Object.keys(this.filters.status).forEach((key) => {
      this.filters.status[key] = false;
    });
    this.first = 0; // Reset to first page when filter changes
    this.applyFilters();
  }

  onFavoriteChanged(newStatus: boolean, staff: any): void {
    staff.isFavorite = newStatus;
    this.favoriteChange.emit({ newStatus, staff });
  }

  getNavigationQueryParams(): Record<string, any> {
    const queryParams = { ...this.route.snapshot.queryParams };
    // Ensure viewMode is set (default to 'grid' for grid view)
    if (!queryParams['viewMode']) {
      queryParams['viewMode'] = 'grid';
    }
    return queryParams;
  }
}
