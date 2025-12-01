import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { ClientService } from '@core/services/client.service';
import { ClientCompanyService, ClientCompany } from '@app/core/services/client-company.service';
import { TableRowCollapseEvent, TableRowExpandEvent } from 'primeng/table';
import * as Papa from 'papaparse';
import { ProjectService } from '@app/core/services/project.service';
import { ReportService } from '@app/core/services/report.service';
import { MerchandiserService, Merchandiser } from '@app/core/services/merchandiser.service';
import * as XLSX from 'xlsx-js-style';
import { catchError, of } from 'rxjs';
import { ReportStatusEnum } from '@core/enums/status.enum';

interface Report {
  id?: number;
  project?: {
    id?: number;
    name?: string;
    startDate?: string;
    endDate?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  status?: {
    id?: number;
    name?: string;
    color?: string;
  };
  clientCompany?: {
    id?: number;
    logo?: {
      id?: string;
      path?: string;
    };
    name?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  branch?: {
    id?: number;
    name?: string;
    branchNumber?: string | null;
    client?: {
      id?: number;
      logo?: {
        id?: string;
        path?: string;
      };
      name?: string;
      createdAt?: string;
      updatedAt?: string;
    };
    createdAt?: string;
    updatedAt?: string;
  };
  street?: string; // <-- add this
  zipCode?: string; // <-- add this
  address?: string;
  plannedOn?: string;
  note?: string;
  reportTo?: string;
  feedback?: string | boolean;
  isSpecCompliant?: boolean;
  isFavorite?: boolean;
  createdAt?: string;
  updatedAt?: string;
  merchandiser?: any; // <-- add this
}

interface Project {
  id?: string;
  name?: string;
  zeitraum?: string;
  calendarWeek?: string; // Add this for the KW number
  filialen?: number;
  status?: string;
  isFavorite?: boolean;
  reports?: Report[];
  slug?: string;
  branchesCount?: number;
  reportedPercentage?: number; // Calculated in backend
}

interface Column {
  field: string;
  header: string;
}

@Component({
  selector: 'app-client-detail',
  templateUrl: './client-detail.component.html',
  standalone: false,
})
export class ClientDetailComponent implements OnInit {
  client: ClientCompany | undefined;
  projects!: Project[];
  selectedProject!: Project | null;
  expandedRows: { [key: string]: boolean } = {};
  cols!: Column[];
  selectedColumns!: Column[];
  dateRange: Date[] = [];

  // Add filter properties
  clientSearchTerm: string = '';
  projectSearchTerm: string = '';
  filialeSearchTerm: string = '';
  filteredProjects: Project[] = [];

  // Status parameter from query string
  statusFilter: string = '';

  // Report status column filter
  reportStatusFilter: string[] = [];

  // Report merchandiser column filter
  reportMerchandiserFilter: string[] = [];

  // Report filialen (branch) column filter
  reportFilialenFilter: string[] = [];

  // Report plannedOn date column filter
  reportPlannedOnFilter: string[] = [];

  // Project name column filter
  projectNameFilter: string[] = [];

  // Generic filters for project columns
  projectColumnFilterValues: { [field: string]: string[] } = {};
  currentProjectFilterField: string = '';

  // Generic filters for other columns
  genericFilterValues: { [field: string]: string[] } = {};
  currentFilterField: string = '';

  dateRange2 = { start: null, end: null };

  // Loading state for initial page load
  isLoading: boolean = false;

  // Loading state for project reports
  loadingReports: { [projectId: string]: boolean } = {};

  private buildFilterQueryParams(overrides: Record<string, any> = {}): Record<string, any> {
    const params: Record<string, any> = {
      status: this.statusFilter || undefined,
      clientSearch: this.clientSearchTerm || undefined,
      projectSearch: this.projectSearchTerm || undefined,
      filialeSearch: this.filialeSearchTerm || undefined,
      reportStatusFilter: this.reportStatusFilter && this.reportStatusFilter.length > 0 ? [...this.reportStatusFilter] : undefined,
      reportMerchandiserFilter: this.reportMerchandiserFilter && this.reportMerchandiserFilter.length > 0 ? [...this.reportMerchandiserFilter] : undefined,
      reportFilialenFilter: this.reportFilialenFilter && this.reportFilialenFilter.length > 0 ? [...this.reportFilialenFilter] : undefined,
      startDate: this.dateRange2.start ? this.dateRange2.start.toISOString().split('T')[0] : undefined,
      endDate: this.dateRange2.end ? this.dateRange2.end.toISOString().split('T')[0] : undefined,
    };

    return this.cleanQueryParams({ ...params, ...overrides });
  }

  private cleanQueryParams(params: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};

    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        const filtered = value.map((entry) => (typeof entry === 'string' ? entry.trim() : entry)).filter((entry) => entry !== undefined && entry !== null && entry !== '' && entry !== 'null');

        if (filtered.length > 0) {
          cleaned[key] = filtered;
        }
        return;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '' && trimmed !== 'null') {
          cleaned[key] = trimmed;
        }
        return;
      }

      cleaned[key] = value;
    });

    return cleaned;
  }

  private extractArrayQueryParam(queryParamMap: ParamMap, key: string): string[] {
    const values = queryParamMap
      .getAll(key)
      .map((val) => val?.trim())
      .filter((val): val is string => !!val && val !== 'null');

    if (values.length > 0) {
      return values;
    }

    const single = queryParamMap.get(key)?.trim();
    if (single && single !== 'null') {
      return single
        .split(',')
        .map((val) => val.trim())
        .filter((val) => val !== '');
    }

    return [];
  }

  private restoreFiltersFromQuery(queryParamMap: ParamMap): void {
    const status = queryParamMap.get('status');
    this.statusFilter = status && status !== 'null' ? status : '';

    const clientSearch = queryParamMap.get('clientSearch');
    this.clientSearchTerm = clientSearch && clientSearch !== 'null' ? clientSearch.toLowerCase() : '';

    const projectSearch = queryParamMap.get('projectSearch');
    this.projectSearchTerm = projectSearch && projectSearch !== 'null' ? projectSearch.toLowerCase() : '';

    const filialeSearch = queryParamMap.get('filialeSearch');
    this.filialeSearchTerm = filialeSearch && filialeSearch !== 'null' ? filialeSearch.toLowerCase() : '';

    this.reportStatusFilter = this.extractArrayQueryParam(queryParamMap, 'reportStatusFilter');
    this.reportMerchandiserFilter = this.extractArrayQueryParam(queryParamMap, 'reportMerchandiserFilter');
    this.reportFilialenFilter = this.extractArrayQueryParam(queryParamMap, 'reportFilialenFilter');

    // Restore date range
    const startDate = queryParamMap.get('startDate');
    const endDate = queryParamMap.get('endDate');
    if (startDate && startDate !== 'null') {
      this.dateRange2.start = new Date(startDate);
    } else {
      this.dateRange2.start = null;
    }
    if (endDate && endDate !== 'null') {
      this.dateRange2.end = new Date(endDate);
    } else {
      this.dateRange2.end = null;
    }
  }

  private navigateWithFilters(commands: any[], overrides: Record<string, any> = {}): void {
    const queryParams = this.buildFilterQueryParams(overrides);
    const extras: any = {};

    if (Object.keys(queryParams).length > 0) {
      extras.queryParams = queryParams;
    }

    this.router.navigate(commands, extras);
  }

  getReportNavigationQueryParams(report?: Report): Record<string, any> {
    const overrides: Record<string, any> = {
      referrer: 'client-detail',
    };

    if (report?.status?.name) {
      overrides['reportStatus'] = report.status.name;
    }

    return this.buildFilterQueryParams(overrides);
  }

  getEditReportNavigationQueryParams(report?: Report): Record<string, any> {
    const params = this.getReportNavigationQueryParams(report);
    // referrer is already 'client-detail' from getReportNavigationQueryParams
    return params;
  }

  openReportInNewTab(report: Report): void {
    if (!report.clientCompany?.id || !report.project?.id || !report.id) {
      return;
    }
    const urlTree = this.router.createUrlTree(['/clients', report.clientCompany.id, 'projects', report.project.id, 'reports', report.id], { queryParams: this.getReportNavigationQueryParams(report) });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  openReportEditInNewTab(report: Report): void {
    if (!report.clientCompany?.id || !report.project?.id || !report.id) {
      return;
    }
    const urlTree = this.router.createUrlTree(['/clients', report.clientCompany.id, 'projects', report.project.id, 'edit-report', report.id], {
      queryParams: this.getEditReportNavigationQueryParams(report),
    });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  onReportContextMenu(event: MouseEvent, report: Report): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openReportInNewTab(report);
    return false;
  }

  onReportEditContextMenu(event: MouseEvent, report: Report): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openReportEditInNewTab(report);
    return false;
  }

  @ViewChild('dateRangePicker', { static: false, read: ElementRef }) dateRangePickerRef: ElementRef;

  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    this.dateRange2 = range;
    
    // If dates are cleared, reload all reports for all expanded projects without date filter
    if (!range.start || !range.end) {
      this.reloadReportsForExpandedProjects();
    } else {
      // If dates are set, apply date filter
      this.filterReportsByPlannedOn(this.selectedProject);
    }
  }

  /**
   * Reload reports for all expanded projects without date filtering
   */
  private reloadReportsForExpandedProjects(): void {
    // Reload reports for the selected project if it exists
    if (this.selectedProject && this.selectedProject.id) {
      this.loadingReports[this.selectedProject.id] = true;
      this.reportService.getReportsByProject(this.selectedProject.id).subscribe({
        next: (reports) => {
          if (this.selectedProject) {
            this.selectedProject.reports = reports;
          }
          if (this.selectedProject && this.selectedProject.id) {
            this.loadingReports[this.selectedProject.id] = false;
          }
        },
        error: (err) => {
          console.error('Error reloading reports:', err);
          if (this.selectedProject && this.selectedProject.id) {
            this.loadingReports[this.selectedProject.id] = false;
          }
        },
      });
    }

    // Reload reports for all other expanded projects
    Object.keys(this.expandedRows).forEach((projectId) => {
      if (this.expandedRows[projectId] && projectId !== this.selectedProject?.id?.toString()) {
        const project = this.projects.find((p) => p.id?.toString() === projectId);
        if (project && project.id) {
          this.loadingReports[project.id] = true;
          this.reportService.getReportsByProject(project.id).subscribe({
            next: (reports) => {
              project.reports = reports;
              this.loadingReports[project.id] = false;
            },
            error: (err) => {
              console.error(`Error reloading reports for project ${project.id}:`, err);
              project.reports = [];
              this.loadingReports[project.id] = false;
            },
          });
        }
      }
    });
  }

  openPlannedOnDateFilter(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    console.log('Opening date range picker');

    // Find and click the date range picker element
    setTimeout(() => {
      const datePickerElement = document.querySelector('app-date-range-picker') as HTMLElement;
      if (datePickerElement) {
        const clickableDiv = datePickerElement.querySelector('div.cursor-pointer') as HTMLElement;
        if (clickableDiv) {
          clickableDiv.click();
          console.log('✅ Date picker opened via DOM click');
        } else {
          console.warn('Date picker clickable div not found');
        }
      } else {
        console.warn('Date picker element not found');
      }
    }, 0);
  }

  onPlannedOnColumnClick(event: Event) {
    event.stopPropagation();
    this.openPlannedOnDateFilter(event);
  }

  private filterReportsByPlannedOn(project: Project) {
    console.log(this.dateRange2);
    if (!this.dateRange2.start || !this.dateRange2.end) {
      return;
    }
    const startDate = new Date(this.dateRange2.start);
    const endDate = new Date(this.dateRange2.end);
    console.log('here');
    // Set end date to end of day for inclusive filtering
    endDate.setHours(23, 59, 59, 999);

    if (project && project.id) {
      this.loadingReports[project.id] = true;
    }

    // Filter reports by plannedOn date range
    this.reportService.getReportsByProject(project.id).subscribe({
      next: (reports) => {
        project.reports = reports.filter((report) => {
          if (!report.plannedOn) return false;
          const reportDate = new Date(report.plannedOn);
          return reportDate >= startDate && reportDate <= endDate;
        });
        if (project && project.id) {
          this.loadingReports[project.id] = false;
        }
        console.log(`Filtered reports: ${project.reports.length} reports in date range`);
      },
      error: (err) => {
        console.error('Error filtering reports:', err);
        if (project && project.id) {
          this.loadingReports[project.id] = false;
        }
      },
    });
  }

  @ViewChild('datePickerButton') datePickerButton: ElementRef;
  @ViewChild('datePickerContent') datePickerContent: ElementRef;
  isDatePickerOpen = false;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Handle date picker closing
    if (this.isDatePickerOpen) {
      const buttonEl = this.datePickerButton?.nativeElement;
      const contentEl = this.datePickerContent?.nativeElement;

      if (buttonEl && contentEl) {
        // Only close if both dates are selected or if click is outside both elements
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

  myDate: Date | null = null;

  // Add these new properties for nested table columns
  reportCols!: Column[];
  selectedReportColumns!: Column[];

  // Add these properties
  @ViewChild('csvFileInput') csvFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('excelFileInput') excelFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('excelTestFileInput') excelTestFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('genericFilterPopover') genericFilterPopover: any;
  @ViewChild('projectColumnFilterPopover') projectColumnFilterPopover: any;
  @ViewChild('statusFilterPopover') statusFilterPopover: any;
  @ViewChild('merchandiserFilterPopover') merchandiserFilterPopover: any;
  @ViewChild('filialenFilterPopover') filialenFilterPopover: any;
  @ViewChild('plannedOnFilterPopover') plannedOnFilterPopover: any;
  @ViewChild('projectFilterPopover') projectFilterPopover: any;
  @ViewChild('projectSettingsPopover') projectSettingsPopover: any;
  @ViewChild('reportSettingsPopover') reportSettingsPopover: any;
  private activeFilterPopover: any = null;
  private activeSettingsPopover: any = null;
  csvDialogVisible = false;
  isUpload = false;
  dialogMessage = '';

  // Add these properties for sorting
  projectSortField: string = '';
  projectSortOrder: number = 1; // 1 for ascending, -1 for descending
  reportSortField: string = '';
  reportSortOrder: number = 1;

  // Add ordered columns properties
  projectsOrderedColumns: Column[] = [];
  reportsOrderedColumns: Column[] = [];

  // Add these properties to track visible columns
  projectsVisibleColumns: { [key: string]: boolean } = {};
  reportsVisibleColumns: { [key: string]: boolean } = {};

  uploadedCsvData: any[] = [];
  csvDialogIsError: boolean = false;

  private lastLoadedClientId: number | null = null;

  // Track which report is being edited for plannedOn
  editingPlannedOnReportId: number | null = null;
  originalPlannedOnValue: string | null = null; // Store original value when editing starts

  // Merchandiser dropdown properties
  merchandisers: Merchandiser[] = [];
  editingMerchandiserReportId: number | null = null;
  selectedMerchandiserId: number | null = null;
  showMerchandiserChangeDialog: boolean = false;
  merchandiserChangeReport: Report | null = null;
  newMerchandiserId: number | null = null;

  // Called when pencil_square is clicked
  startEditingPlannedOn(report: Report): void {
    this.editingPlannedOnReportId = report.id ?? null;
    // Store the original value to restore if canceled
    this.originalPlannedOnValue = report.plannedOn || null;
  }

  /**
   * Cancel editing plannedOn date
   */
  cancelEditingPlannedOn(): void {
    // Restore the original value if it was changed
    if (this.editingPlannedOnReportId !== null) {
      const report = this.findReportById(this.editingPlannedOnReportId);
      if (report) {
        report.plannedOn = this.originalPlannedOnValue;
      }
    }
    // Reset the editing state - no need to reload data
    this.editingPlannedOnReportId = null;
    this.originalPlannedOnValue = null;
  }
  
  /**
   * Helper method to find a report by ID in all projects
   */
  private findReportById(reportId: number): Report | null {
    for (const project of this.projects) {
      if (project.reports) {
        const report = project.reports.find(r => r.id === reportId);
        if (report) {
          return report;
        }
      }
    }
    return null;
  }

  /**
   * Save plannedOn date edit
   */
  savePlannedOnEdit(report: Report): void {
    if (!report.id || !report.plannedOn) {
      this.editingPlannedOnReportId = null;
      return;
    }

    // Create FormData to match the backend's expected format
    const formData = new FormData();
    const updateData = {
      appointmentDate: report.plannedOn, // Backend expects 'appointmentDate' field
    };
    formData.append('data', JSON.stringify(updateData));

    // Update the report with new plannedOn date
    this.reportService
      .updateReportWithFormData(report.id, formData)
      .pipe(
        catchError((error) => {
          console.error('❌ Error updating planned date:', error);
          this.dialogMessage = 'Fehler beim Aktualisieren des Datums';
          this.csvDialogIsError = true;
          this.csvDialogVisible = true;
          return of(null);
        }),
      )
      .subscribe((updatedReport) => {
        if (updatedReport) {
          console.log('✅ Planned date updated successfully');
          this.dialogMessage = 'Datum erfolgreich aktualisiert';
          this.csvDialogIsError = false;
          this.csvDialogVisible = true;

          // Update the report in the projects array
          if (this.selectedProject && this.selectedProject.reports) {
            const reportIndex = this.selectedProject.reports.findIndex((r) => r.id === report.id);
            if (reportIndex !== -1) {
              this.selectedProject.reports[reportIndex].plannedOn = report.plannedOn;
            }
          }

          this.editingPlannedOnReportId = null;
        }
      });
  }

  /**
   * Update onPlannedOnDateChange to only update the value, not close the input
   */
  onPlannedOnDateChange(report: Report, event: any): void {
    report.plannedOn = event.target.value;
    // Do not close the input here
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private clientService: ClientService,
    private projectService: ProjectService,
    private reportService: ReportService,
    private clientCompanyService: ClientCompanyService,
    private merchandiserService: MerchandiserService,
  ) {}

  ngOnInit(): void {
    // Initialize report filters
    this.reportStatusFilter = [];
    this.reportMerchandiserFilter = [];
    this.projectNameFilter = [];
    this.projectColumnFilterValues = {};
    this.reportFilialenFilter = [];

    this.restoreFiltersFromQuery(this.route.snapshot.queryParamMap);

    this.route.queryParamMap.subscribe((queryParamMap) => {
      this.restoreFiltersFromQuery(queryParamMap);
      if (Array.isArray(this.projects) && this.projects.length > 0) {
        this.applyFilters();
      }
    });

    this.route.paramMap.subscribe((params) => {
      this.statusFilter = this.route.snapshot.queryParamMap.get('status') || '';

      // Support both projectSlug and projectId, and always extract clientId
      const clientId = params.get('clientId');
      const projectSlug = params.get('projectSlug') || params.get('projectId');
      console.log('Route params:', params.keys, 'clientId:', clientId, 'projectSlug:', projectSlug);

      // Reset expanded rows on route change
      this.expandedRows = {};

      const clientIdNum = Number(clientId);
      if (clientIdNum) {
        if (clientIdNum !== this.lastLoadedClientId) {
          this.lastLoadedClientId = clientIdNum;
          this.isLoading = true;
          this.clientCompanyService.getProjectsByClientCompany(clientIdNum).subscribe({
            next: (response) => {
              this.projects = response.projects || [];
              this.client = response.clientCompany;
              this.isLoading = false;

              // Apply filters after loading projects (including status filter)
              // This also preloads reports for all filtered projects
              this.applyFilters();

              // If arriving with a status filter and no explicit project selected, expand all filtered projects
              if (this.statusFilter && !projectSlug) {
                const toExpand = this.filteredProjects || [];
                toExpand.forEach((proj) => {
                  if (proj && proj.id) {
                    this.expandedRows[proj.id as string] = true;
                    // Load reports for expanded projects when status filter is present
                    if (!proj.reports) {
                      this.loadingReports[proj.id] = true;
                      this.reportService.getReportsByProject(proj.id).subscribe({
                        next: (reports) => {
                          proj.reports = reports;
                          this.loadingReports[proj.id] = false;
                        },
                        error: (err) => {
                          console.error(`Error fetching reports for project ${proj.id}:`, err);
                          proj.reports = [];
                          this.loadingReports[proj.id] = false;
                        },
                      });
                    }
                  }
                });
              }

              // Update the selected client in ClientService with the loaded projects for sidebar
              if (this.client && this.projects) {
                const selectedClient = this.clientService.getClientById(this.client.id.toString());
                if (selectedClient) {
                  selectedClient.projects = this.projects.map((p) => ({
                    id: p.id?.toString() ?? '',
                    name: p.name ?? '',
                    clientId: this.client!.id.toString(),
                    // Add more fields if needed for the sidebar
                  }));
                }
              }

              // If projectSlug is available, find and set the selectedProject
              if (projectSlug && this.projects) {
                const matchedProject = this.filteredProjects.find((p) => p.id == projectSlug || p.slug == projectSlug);

                if (matchedProject) {
                  this.selectedProject = matchedProject;
                  this.expandedRows[matchedProject.id as string] = true;
                  // Set loading state to true
                  this.loadingReports[matchedProject.id] = true;
                  // Fetch reports for this project on initial load
                  this.reportService.getReportsByProject(matchedProject.id).subscribe({
                    next: (reports) => {
                      matchedProject.reports = reports;
                      this.loadingReports[matchedProject.id] = false;
                    },
                    error: (err) => {
                      console.error('Error fetching reports for project:', err);
                      matchedProject.reports = [];
                      this.loadingReports[matchedProject.id] = false;
                    },
                  });
                } else {
                  this.selectedProject = null;
                }
              } else {
                this.selectedProject = null;
              }
            },
            error: (err) => {
              console.error('Error fetching projects for client company:', err);
              this.projects = [];
              this.filteredProjects = [];
              this.selectedProject = null;
              this.client = undefined;
              this.isLoading = false;
            },
          });
        } else {
          // Only update selected project and fetch reports if needed
          if (projectSlug && this.projects) {
            const matchedProject = this.filteredProjects.find((p) => p.id == projectSlug || p.slug == projectSlug);

            if (matchedProject) {
              this.selectedProject = matchedProject;
              this.expandedRows[matchedProject.id as string] = true;
              this.loadingReports[matchedProject.id] = true;
              // Fetch reports for this project on initial load
              this.reportService.getReportsByProject(matchedProject.id).subscribe({
                next: (reports) => {
                  matchedProject.reports = reports;
                  this.loadingReports[matchedProject.id] = false;
                },
                error: (err) => {
                  console.error('Error fetching reports for project:', err);
                  matchedProject.reports = [];
                  this.loadingReports[matchedProject.id] = false;
                },
              });
            } else {
              this.selectedProject = null;
            }
          } else {
            this.selectedProject = null;
          }
        }
      } else {
        this.client = undefined;
        this.projects = [];
        this.filteredProjects = [];
        this.selectedProject = null;
      }
    });

    // Initialize project columns
    this.cols = [
      { field: 'formattedZeitraum', header: 'Zeitraum' }, // Change field name
      { field: 'filialen', header: 'Filialen' },
      { field: 'status', header: 'Status' },
    ];
    
    // Initialize report columns
    this.reportCols = [
      { field: 'plannedOn', header: 'Geplant' },
      { field: 'merchandiser', header: 'Merchandiser' },
      { field: 'branch.name', header: 'Filiale' },
      { field: 'address', header: 'Adresse' },
      { field: 'note', header: 'Notiz' },
      { field: 'reportTo', header: 'Report bis' },
      { field: 'isSpecCompliant', header: 'Alles nach Vorgabe?' },
      { field: 'feedback', header: 'Feedback' },
    ];

    // Initialize ordered columns
    this.projectsOrderedColumns = [...this.cols];
    this.reportsOrderedColumns = [...this.reportCols];

    // Set all columns to visible by default
    this.initializeVisibleColumns();

    // Set all columns as selected by default (all columns should be displayed)
    this.selectedColumns = [...this.cols];
    // Exclude feedback and isSpecCompliant from default selection - they're optional
    this.selectedReportColumns = this.reportCols.filter(
      col => col.field !== 'feedback' && col.field !== 'isSpecCompliant'
    );

    // Remove static initializeProjects method
  }

  // Navigate to project detail
  navigateToProjectCreate(): void {
    if (this.client?.id) {
      this.navigateWithFilters(['/clients', this.client.id, 'projects', 'create']);
    }
  }

  private navigateToProject(project: any, overrides: Record<string, any> = {}): void {
    if (!this.client?.id || !project?.id) {
      return;
    }

    this.navigateWithFilters(['/clients', this.client.id, 'projects', project.id], overrides);
  }

  private navigateBackToClient(): void {
    if (!this.client?.id) {
      return;
    }

    this.navigateWithFilters(['/clients', this.client.id]);
  }

  // Modify the column selector click handler to navigate if project is provided
  handleColumnHeaderClick(event: Event, project?: Project): void {
    if (project) {
      event.preventDefault();
      event.stopPropagation();
      this.navigateToProject(project);
    } else {
      // This is for the column selector in the header
      // Keep the existing op.toggle behavior
    }
  }

  // Your existing methods
  members = [
    { name: 'Amy Elsner', image: 'amyelsner.png', email: 'amy@email.com', role: 'Owner' },
    { name: 'Bernardo Dominic', image: 'bernardodominic.png', email: 'bernardo@email.com', role: 'Editor' },
    { name: 'Ioni Bowcher', image: 'ionibowcher.png', email: 'ioni@email.com', role: 'Viewer' },
  ];

  // Enhance selectProject method to also expand the row
  selectProject(project: Project) {
    this.selectedProject = project;

    // Expand the selected project row
    if (project && project.id) {
      this.expandedRows = {}; // Clear any previous expanded rows
      this.expandedRows[project.id] = true;

      // Set loading state to true
      this.loadingReports[project.id] = true;

      // Fetch reports for this project
      this.reportService.getReportsByProject(project.id).subscribe({
        next: (reports) => {
          project.reports = reports;
          this.loadingReports[project.id] = false;
        },
        error: (err) => {
          console.error('Error fetching reports for project:', err);
          project.reports = [];
          this.loadingReports[project.id] = false;
        },
      });
    }

    // Navigate to the project route
    this.navigateToProject(project);
  }

  getSeverity(status: string) {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'PLANNED':
        return 'info';
      case 'DRAFT':
        return 'warning';
      case 'COMPLETED':
        return 'success';
      case 'PENDING':
        return 'warning';
      default:
        return 'info';
    }
  }

  getStatusSeverity(status: string) {
    switch (status) {
      case 'PENDING':
        return 'warn';
      case 'DELIVERED':
        return 'success';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'unknown';
    }
  }

  onRowExpand(event: TableRowExpandEvent) {
    const project = event.data as Project;
    console.log({ severity: 'info', summary: 'Project Expanded', detail: project.name, life: 3000 });
    
    // Load reports if not already loaded
    if (project && project.id && !project.reports) {
      this.loadingReports[project.id] = true;
      this.reportService.getReportsByProject(project.id).subscribe({
        next: (reports) => {
          project.reports = reports;
          this.loadingReports[project.id] = false;
        },
        error: (err) => {
          console.error(`Error fetching reports for project ${project.id}:`, err);
          project.reports = [];
          this.loadingReports[project.id] = false;
        },
      });
    }
  }

  // Method to collapse the currently expanded project
  collapseProject(): void {
    // Clear the expanded rows
    this.expandedRows = {};
    // Clear selected project
    this.selectedProject = null;

    // Navigate back to the client detail route (without project)
    if (this.client) {
      this.navigateBackToClient();
    }
  }

  // Modify the existing onRowCollapse method to also update the route
  onRowCollapse(event: TableRowCollapseEvent) {
    console.log({ severity: 'success', summary: 'Project Collapsed', detail: event.data.name, life: 3000 });

    // If the collapsed row is the selected project, update the route
    if (this.selectedProject && this.selectedProject.id === event.data.id) {
      this.collapseProject();
    }
  }

  toggleDatePicker(): void {
    this.isDatePickerOpen = !this.isDatePickerOpen;
  }

  closeDatePicker(): void {
    this.isDatePickerOpen = false;
  }

  onDateRangeSelect(event: any): void {
    if (this.dateRange.length === 2) {
      // Both dates are selected, close the popover after a short delay
      setTimeout(() => this.closeDatePicker(), 200);
    }
  }

  onDateSelected(date: Date): void {
    console.log('Selected date:', date);
    this.myDate = date;
  }

  onFavoriteChanged(newStatus: boolean, project: Project): void {
    console.log('🔄 Toggling project favorite status:', { id: project.id, newStatus });

    // Optimistically update the UI
    const previousStatus = project.isFavorite;
    project.isFavorite = newStatus;

    // Call backend to toggle favorite status
    this.projectService
      .toggleFavoriteStatus(project.id!)
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling project favorite status:', error);

          // Revert the optimistic update on error
          project.isFavorite = previousStatus;

          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Project favorite status updated:', result);

            // Update the status based on server response
            project.isFavorite = result.isFavorite;
          }
        },
      });
  }

  /**
   * Calculate the percentage of reported orders for a project
   */
  /**
   * Preload reports for all projects in the background to enable status percentage calculation
   */
  private preloadReportsForAllProjects(projects: Project[]): void {
    if (!projects || projects.length === 0) {
      return;
    }

    projects.forEach((project) => {
      if (project && project.id) {
        // Only load if reports are not already loaded
        if (!project.reports) {
          // Load reports in background without showing loading indicator for preload
          this.reportService.getReportsByProject(project.id).subscribe({
            next: (reports) => {
              project.reports = reports;
            },
            error: (err) => {
              console.error(`Error preloading reports for project ${project.id}:`, err);
              project.reports = [];
            },
          });
        }
      }
    });
  }

  getReportedPercentage(project: Project): number {
    // Use backend-calculated value if available, otherwise fallback to 0
    return project.reportedPercentage ?? 0;
  }

  private getReportBranchKey(report: Report): string | null {
    if (report.branch?.id) {
      return `branch-id-${report.branch.id}`;
    }

    const branchNumber = report.branch?.branchNumber?.toString().trim();
    if (branchNumber) {
      return `branch-number-${branchNumber}`;
    }

    const branchName = report.branch?.name?.toString().trim();
    if (branchName) {
      return `branch-name-${branchName}`;
    }

    if (report.id !== undefined) {
      return `report-${report.id}`;
    }

    return null;
  }

  // Add this method to handle favorite changes for reports
  onReportFavoriteChanged(newStatus: boolean, report: Report): void {
    const previousStatus = report.isFavorite;
    report.isFavorite = newStatus;

    this.reportService.toggleFavoriteStatus(report.id!).subscribe({
      next: (result) => {
        if (result) {
          report.isFavorite = result.isFavorite;
          // Optionally show a toast: result.message
        }
      },
      error: (error) => {
        report.isFavorite = previousStatus; // revert on error
        // Optionally show a toast: 'Fehler beim Aktualisieren der Favoriten'
      },
    });
  }

  // Method to open file input when CSV icon is clicked
  openCsvUploader(project: Project): void {
    this.selectedProject = project;
    // Trigger click on hidden file input
    if (this.csvFileInput) {
      this.csvFileInput.nativeElement.click();
    }
  }

  // Handle CSV file upload
  handleCsvFileUpload(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (file && this.selectedProject) {
      // Here you would typically handle the CSV file upload using a service
      console.log(`Uploading CSV for project: ${this.selectedProject.name}`, file);

      // Example of reading the file content
      const reader = new FileReader();
      reader.onload = (e) => {
        const contents = e.target?.result as string;

        // Process the CSV content using PapaParse
        this.processCsvContent(contents);

        // After parsing, automatically trigger bulk insert if data is present
        if (this.selectedProject && this.uploadedCsvData.length > 0) {
          this.bulkInsertCsvReports(this.selectedProject);
        }

        // Reset file input
        fileInput.value = '';
      };

      reader.readAsText(file);
    }
  }

  // Process CSV content using PapaParse
  private processCsvContent(csvContent: string): void {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        this.uploadedCsvData = results.data as any[];
        console.log('Parsed objects:', this.uploadedCsvData);
        // You can now use this.uploadedCsvData as needed
      },
      error: (err) => {
        console.error('CSV parsing error:', err);
      },
    });
  }

  // Download Excel for project
  downloadProjectCsv(project: Project): void {
    if (!project) return;

    console.log('📊 Exporting project reports as Excel:', project, 'with status filter:', this.statusFilter);
    console.log('🔍 Current URL query params:', this.route.snapshot.queryParamMap);

    // Pass the status filter if it exists
    this.reportService.exportProjectReportsAsExcel(project.id, this.statusFilter).subscribe({
      next: (blob: Blob) => {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${project.name?.replace(/\s+/g, '_')}_reports_export.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Show success message
        this.isUpload = false;
        this.dialogMessage = 'Excel-Export erfolgreich heruntergeladen';
        this.csvDialogVisible = true;
      },
      error: (error) => {
        console.error('❌ Error exporting Excel:', error);

        // Check if it's a "no data" error - generate empty template
        if (error.status === 404 || (error.error?.error === 'NO_DATA_FOUND') || (error.status === 400 && error.error?.message?.includes('Keine Daten'))) {
          // Generate empty Excel template
          this.generateEmptyExcelTemplate(project);
        } else {
          this.dialogMessage = 'Excel-Export fehlgeschlagen!';
          this.csvDialogIsError = true;
          this.csvDialogVisible = true;
        }
      },
    });
  }

  // Generate empty Excel template with headers
  private generateEmptyExcelTemplate(project: Project): void {
    try {
      // Create workbook
      const workbook = XLSX.utils.book_new();

      // Define headers based on the mapExcelRowToReport function
      // These headers match what the upload function expects
      const headers = [
        'FILIALNUMMER',
        'FILIALE\n(Text)',
        'STRABE +\nHAUSNUM\nMER',
        'PLZ',
        'ORT',
        'LAND',
        'TELEFON\nFILIALE\n(Text)',
        'NOTIZ\n(Text)',
        'MERCHANDISER\n(Text)',
        'BESUCHSDATUM',
        'Report bis',
        'Alles nach Vorgabe?\n1. JA\n2. NEIN',
        'Feedback\n1. JA\n2. NEIN',
      ];

      // Create worksheet with just headers
      const worksheet = XLSX.utils.aoa_to_sheet([headers]);

      // Set column widths
      const columnWidths = headers.map(() => ({ wch: 20 }));
      worksheet['!cols'] = columnWidths;

      // Style the header row using xlsx-js-style (gray background)
      const headerStyle = {
        font: { bold: true, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: 'D3D3D3' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      };

      // Apply header style to first row
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { v: headers[col], t: 's' };
        }
        worksheet[cellAddress].s = headerStyle;
      }

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports');

      // Generate Excel file
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name?.replace(/\s+/g, '_')}_template.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Show success message
      this.isUpload = false;
      this.dialogMessage = 'Excel-Vorlage erfolgreich heruntergeladen (leer, zum Ausfüllen)';
      this.csvDialogIsError = false;
      this.csvDialogVisible = true;
    } catch (error) {
      console.error('❌ Error generating empty Excel template:', error);
      this.dialogMessage = 'Fehler beim Erstellen der Excel-Vorlage!';
      this.csvDialogIsError = true;
      this.csvDialogVisible = true;
    }
  }

  // Generate CSV content from project data
  private generateProjectCsv(project: Project): string {
    // Create CSV header row
    let csv = 'ID,Filialnummer,Filiale,Status,Geplant,Merchandiser,Adresse,Notiz,Report bis,Nach Vorgabe,Feedback\n';

    // Add data rows
    if (project.reports && project.reports.length > 0) {
      project.reports.forEach((report) => {
        csv += `${report.id || ''},`;
        csv += `${this.escapeCsvValue(report.branch?.branchNumber || '')},`;
        csv += `${this.escapeCsvValue(report.branch?.name || '')},`;
        csv += `${report.status?.name || ''},`;
        csv += `${report.plannedOn || ''},`;
        csv += `${this.escapeCsvValue(this.getReportMerchandiserName(report))},`;
        csv += `${this.escapeCsvValue(report.address || '')},`;
        csv += `${this.escapeCsvValue(report.note || '')},`;
        csv += `${report.reportTo || ''},`;
        csv += `${report.isSpecCompliant ? 'Ja' : 'Nein'},`;
        csv += `${report.feedback ? 'Ja' : 'Nein'}\n`;
      });
    }

    return csv;
  }

  // Helper method to escape CSV values that might contain commas
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      // Escape quotes by doubling them and wrap in quotes
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // Add these new methods for handling sort
  onProjectSort(field: string, event?: Event): void {
    // Stop event propagation to prevent column toggle
    if (event) {
      event.stopPropagation();
    }

    if (this.projectSortField === field) {
      // If clicking on the same field, toggle the sort order
      this.projectSortOrder = this.projectSortOrder * -1;
    } else {
      // New sort field, default to ascending
      this.projectSortField = field;
      this.projectSortOrder = 1;
    }

    // Apply sorting
    this.sortProjects(field, this.projectSortOrder);
  }

  onReportSort(field: string, project: Project, event?: Event): void {
    // Stop event propagation to prevent column toggle and date picker opening
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    if (this.reportSortField === field) {
      // If clicking on the same field, toggle the sort order
      this.reportSortOrder = this.reportSortOrder * -1;
    } else {
      // New sort field, default to ascending
      this.reportSortField = field;
      this.reportSortOrder = 1;
    }

    // Apply sorting to the specific project's reports
    if (project && project.reports) {
      this.sortReports(project.reports, field, this.reportSortOrder);
    }
  }

  private sortProjects(field: string, order: number): void {
    // Sort the filtered projects that are displayed in the table
    this.filteredProjects.sort((a, b) => {
      const valueA = this.getProjectField(a, field);
      const valueB = this.getProjectField(b, field);

      // Handle null/undefined values - put them at the end
      if (valueA === null || valueA === undefined || valueA === '') {
        return order; // Put empty values at the end
      }
      if (valueB === null || valueB === undefined || valueB === '') {
        return -order; // Put empty values at the end
      }

      if (valueA === valueB) {
        return 0;
      }

      // Handle numeric comparison
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return order * (valueA - valueB);
      }

      // Handle string case-insensitive comparison
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order * valueA.localeCompare(valueB, undefined, { sensitivity: 'base' });
      }

      // Fallback comparison
      if (valueA < valueB) {
        return order * -1;
      }
      return order;
    });
  }

  private sortReports(reports: Report[], field: string, order: number): void {
    reports.sort((a, b) => {
      const valueA = this.getReportField(a, field);
      const valueB = this.getReportField(b, field);

      // Handle null/undefined values - put them at the end
      if (valueA === null || valueA === undefined || valueA === '') {
        return order; // Put empty values at the end
      }
      if (valueB === null || valueB === undefined || valueB === '') {
        return -order; // Put empty values at the end
      }

      if (valueA === valueB) {
        return 0;
      }

      // Handle numeric comparison (for dates converted to timestamps)
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return order * (valueA - valueB);
      }

      // Handle string case-insensitive comparison
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order * valueA.localeCompare(valueB, undefined, { sensitivity: 'base' });
      }

      // Fallback comparison
      if (valueA < valueB) {
        return order * -1;
      }
      return order;
    });
  }

  private getProjectField(project: Project, field: string): any {
    if (field === 'name') {
      return project.name || '';
    }

    if (field === 'formattedZeitraum') {
      return project.zeitraum || '';
    }

    if (field === 'filialen') {
      // Return branchesCount for numeric sorting
      return project.branchesCount ?? 0;
    }

    if (field === 'status') {
      return this.getReportedPercentage(project);
    }

    return project[field as keyof Project] || '';
  }

  private getReportField(report: Report, field: string): any {
    // Handle status field
    if (field === 'status') {
      return report.status?.name || '';
    }

    // Handle address field - use getReportAddress method
    if (field === 'address') {
      return this.getReportAddress(report);
    }

    // Handle merchandiser field - use getReportMerchandiserName method
    if (field === 'merchandiser') {
      return this.getReportMerchandiserName(report);
    }

    // Handle nested branch.name field
    if (field === 'branch.name') {
      return report.branch?.name || '';
    }

    // Handle date fields - convert to comparable format
    if (field === 'plannedOn' || field === 'reportTo') {
      const dateValue = report[field as keyof Report];
      if (dateValue) {
        // Convert to timestamp for proper sorting
        const date = new Date(dateValue as string);
        return isNaN(date.getTime()) ? 0 : date.getTime();
      }
      return 0;
    }

    // Handle boolean fields
    if (field === 'isSpecCompliant') {
      return report.isSpecCompliant ? 'Ja' : 'Nein';
    }

    if (field === 'feedback') {
      return report.feedback === true || report.feedback === 'true' ? 'Ja' : 'Nein';
    }

    // Handle note field
    if (field === 'note') {
      return report.note || '';
    }

    // Default: try to get the field value directly
    const value = report[field as keyof Report];
    return value !== undefined && value !== null ? String(value) : '';
  }

  /**
   * Generate address string for a report using street, zipCode, and branch city
   */
  getReportAddress(report: Report): string {
    const street = report.street || '';
    const zip = report.zipCode || '';
    // Try to get city from branch.name or branch.city (if available)
    let city = '';
    if (report.branch) {
      // Check if branch has a city property, otherwise use branch name
      if ((report.branch as any).city && (report.branch as any).city.name) {
        city = (report.branch as any).city.name;
      } else {
        city = report.branch.name || '';
      }
    }
    // Only include parts that are not empty
    return [street, zip, city].filter(Boolean).join(', ');
  }

  getReportBranchLabel(report: Report | null | undefined): string {
    if (!report || !report.branch) {
      return '';
    }

    const number = (report.branch.branchNumber ?? '').toString().trim();
    const name = (report.branch.name ?? '').trim();

    if (number && name) {
      return `${number} - ${name}`;
    }

    return number || name || '';
  }

  /**
   * Get merchandiser name for a report
   */
  getReportMerchandiserName(report: Report): string {
    if (report.merchandiser && report.merchandiser.user) {
      const user = report.merchandiser.user;
      return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return '';
  }

  /**
   * Load all merchandisers for the dropdown
   */
  loadMerchandisers(): void {
    this.merchandiserService.getMerchandisers(1, 10000).subscribe({
      next: (response) => {
        this.merchandisers = response.data;
        console.log('✅ Loaded merchandisers:', this.merchandisers.length);
      },
      error: (error) => {
        console.error('❌ Error loading merchandisers:', error);
      },
    });
  }

  /**
   * Start editing merchandiser (show dropdown)
   */
  startEditingMerchandiser(report: Report): void {
    this.editingMerchandiserReportId = report.id ?? null;
    this.selectedMerchandiserId = report.merchandiser?.id ?? null;

    // Load merchandisers if not already loaded
    if (this.merchandisers.length === 0) {
      this.loadMerchandisers();
    }
  }

  /**
   * Cancel editing merchandiser
   */
  cancelEditingMerchandiser(): void {
    this.editingMerchandiserReportId = null;
    this.selectedMerchandiserId = null;
  }

  /**
   * Handle merchandiser selection change
   */
  onMerchandiserChange(report: Report, newMerchandiserId: number): void {
    if (newMerchandiserId && newMerchandiserId !== report.merchandiser?.id) {
      // Show confirmation dialog
      this.merchandiserChangeReport = report;
      this.newMerchandiserId = newMerchandiserId;
      this.showMerchandiserChangeDialog = true;
    }
  }

  /**
   * Confirm merchandiser change
   */
  confirmMerchandiserChange(): void {
    if (!this.merchandiserChangeReport || !this.newMerchandiserId) {
      return;
    }

    const reportId = this.merchandiserChangeReport.id;
    const newMerchandiser = this.merchandisers.find((m) => m.id === this.newMerchandiserId);

    // Create FormData to match the backend's expected format
    const formData = new FormData();
    const updateData = {
      merchandiserId: this.newMerchandiserId,
    };
    formData.append('data', JSON.stringify(updateData));

    // Update the report with new merchandiser using FormData
    this.reportService
      .updateReportWithFormData(reportId!, formData)
      .pipe(
        catchError((error) => {
          console.error('❌ Error updating merchandiser:', error);
          alert('Fehler beim Aktualisieren des Merchandisers');
          return of(null);
        }),
      )
      .subscribe((updatedReport) => {
        if (updatedReport) {
          // Update local data
          this.merchandiserChangeReport!.merchandiser = newMerchandiser;
          console.log('✅ Merchandiser updated successfully');
        }

        // Close dialog and reset editing state
        this.showMerchandiserChangeDialog = false;
        this.merchandiserChangeReport = null;
        this.newMerchandiserId = null;
        this.editingMerchandiserReportId = null;
        this.selectedMerchandiserId = null;
      });
  }

  /**
   * Cancel merchandiser change
   */
  cancelMerchandiserChange(): void {
    this.showMerchandiserChangeDialog = false;
    this.merchandiserChangeReport = null;
    this.newMerchandiserId = null;
    this.selectedMerchandiserId = null;
  }

  /**
   * Get merchandiser display name
   */
  getMerchandiserDisplayName(merchandiser: Merchandiser): string {
    if (merchandiser && merchandiser.user) {
      return `${merchandiser.user.firstName} ${merchandiser.user.lastName}`.trim();
    }
    return '';
  }

  /**
   * Check if report status is NEW
   */
  isReportStatusNew(report: Report): boolean {
    return report.status?.name?.toUpperCase() === 'NEW' || report.status?.id === 1;
  }

  // Initialize visible columns
  initializeVisibleColumns() {
    // Set all project columns to visible by default
    this.cols.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    // Set all report columns to visible by default, except feedback and isSpecCompliant
    this.reportCols.forEach((col) => {
      // Exclude feedback and isSpecCompliant from default visibility
      if (col.field !== 'feedback' && col.field !== 'isSpecCompliant') {
        this.reportsVisibleColumns[col.field] = true;
      } else {
        this.reportsVisibleColumns[col.field] = false;
      }
    });
  }

  // Get visible columns for projects table
  getProjectsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.projectsOrderedColumns.filter((col) => this.projectsVisibleColumns[col.field]);
  }

  // Get visible columns for reports table
  getReportsVisibleColumns(): Column[] {
    // Return ordered columns that are visible
    return this.reportsOrderedColumns.filter((col) => this.reportsVisibleColumns[col.field]);
  }

  // Handle column reordering for projects table
  onProjectsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.projectsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.projectsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.projectsOrderedColumns = newOrderedColumns;
    }
  }

  // Handle column reordering for reports table
  onReportsColReorder(event: any) {
    if (event && typeof event.dragIndex === 'number' && typeof event.dropIndex === 'number') {
      // Get the column that was moved
      const movedColumn = this.reportsOrderedColumns[event.dragIndex];

      // Create a new array without the moved column
      const newOrderedColumns = [...this.reportsOrderedColumns];
      newOrderedColumns.splice(event.dragIndex, 1);

      // Insert the moved column at the drop index
      newOrderedColumns.splice(event.dropIndex, 0, movedColumn);

      // Update the ordered columns with the new order
      this.reportsOrderedColumns = newOrderedColumns;
    }
  }

  // Update visible columns for projects
  onProjectsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.projectsVisibleColumns).forEach((key) => {
      this.projectsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.projectsVisibleColumns[col.field] = true;
    });

    // Update the selectedColumns for backward compatibility
    this.selectedColumns = selectedColumns;
  }

  // Update visible columns for reports
  onReportsColumnsChange(selectedColumns: Column[]) {
    // Reset all to false
    Object.keys(this.reportsVisibleColumns).forEach((key) => {
      this.reportsVisibleColumns[key] = false;
    });

    // Set selected columns to true
    selectedColumns.forEach((col) => {
      this.reportsVisibleColumns[col.field] = true;
    });

    // Update the selectedReportColumns for backward compatibility
    this.selectedReportColumns = selectedColumns;
  }

  // Add filter methods
  onClientSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.clientSearchTerm = target.value.toLowerCase();
    this.applyFilters();
  }

  onProjectSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.projectSearchTerm = target.value.toLowerCase();
    this.applyFilters();
  }

  onFilialeSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.filialeSearchTerm = target.value.toLowerCase();
    this.applyFilters();
  }

  clearProjectSearch(): void {
    this.projectSearchTerm = '';
    this.applyFilters();
  }

  clearFilialeSearch(): void {
    this.filialeSearchTerm = '';
    this.applyFilters();
  }

  private applyFilters(): void {
    if (!Array.isArray(this.projects) || this.projects.length === 0) {
      this.filteredProjects = Array.isArray(this.projects) ? [...this.projects] : [];
      return;
    }

    this.filteredProjects = this.projects.filter((project) => {
      // Client search - search in project name (since we're in client context)
      const matchesClient = !this.clientSearchTerm || (project.name && project.name.toLowerCase().includes(this.clientSearchTerm));

      // Project search - search in project name
      const matchesProject = !this.projectSearchTerm || (project.name && project.name.toLowerCase().includes(this.projectSearchTerm));

      // Project name filter - filter by selected project names
      const matchesProjectName = !this.projectNameFilter || 
        !Array.isArray(this.projectNameFilter) || 
        this.projectNameFilter.length === 0 || 
        (project.name && this.projectNameFilter.includes(project.name));

      // Filiale search - search in reports' filiale field
      const matchesFiliale = !this.filialeSearchTerm || (project.reports && project.reports.some((report) => this.getReportBranchLabel(report).toLowerCase().includes(this.filialeSearchTerm)));

      // Status filter - filter by report status
      const matchesStatus = !this.statusFilter || this.projectMatchesStatusFilter(project);

      // Project column filters (Zeitraum, Filialen, Status)
      const matchesColumnFilters = this.cols.every((col) => {
        const filterValues = this.projectColumnFilterValues[col.field];
        if (!filterValues || !Array.isArray(filterValues) || filterValues.length === 0) {
          return true; // No filter applied for this column
        }

        let projectValue: string = '';
        if (col.field === 'formattedZeitraum') {
          projectValue = project.zeitraum || '';
        } else if (col.field === 'filialen') {
          // Match the exact format displayed in the template: "{{ project.branchesCount }} Stores"
          const count = project.branchesCount ?? 0;
          projectValue = `${count} Stores`;
        } else if (col.field === 'status') {
          const percentage = project.reportedPercentage ?? 0;
          projectValue = `${percentage}% reported`;
        } else {
          projectValue = project[col.field as keyof Project]?.toString() || '';
        }

        return filterValues.includes(projectValue);
      });

      // Check if all basic filters match
      const basicFiltersMatch = matchesClient && matchesProject && matchesProjectName && matchesFiliale && matchesStatus && matchesColumnFilters;
      
      if (!basicFiltersMatch) {
        return false;
      }

      // If a status filter is active (from query params), filter by stores count
      if (this.statusFilter) {
        // Only show projects with stores (branchesCount > 0)
        const branchesCount = project.branchesCount ?? 0;
        if (branchesCount === 0) {
          return false;
        }
        
        // Also check if the project has any filtered reports (if reports are loaded)
        if (project.reports) {
          const filteredReportsCount = this.filteredReports(project).length;
          // If there are 0 filtered reports, hide the project
          if (filteredReportsCount === 0) {
            return false;
          }
        }
      }
      
      // If report status filter is active (from column filter), check filtered reports
      if (this.reportStatusFilter && Array.isArray(this.reportStatusFilter) && this.reportStatusFilter.length > 0) {
        if (project.reports) {
          const filteredReportsCount = this.filteredReports(project).length;
          // If there are 0 filtered reports, hide the project
          if (filteredReportsCount === 0) {
            return false;
          }
        }
      }

      return true;
    });

    // Filtering is purely client-side - no backend calls needed
  }

  // Get unique project names for filter
  getUniqueProjectNames(): string[] {
    if (!Array.isArray(this.projects) || this.projects.length === 0) {
      return [];
    }
    const uniqueNames = new Set<string>();
    this.projects.forEach((project) => {
      if (project.name) {
        uniqueNames.add(project.name);
      }
    });
    return Array.from(uniqueNames).sort();
  }

  // Handle project name filter change
  onProjectNameFilterChange(): void {
    if (!this.projectNameFilter) {
      this.projectNameFilter = [];
    }
    this.applyFilters();
  }

  // Open project column filter popover
  openProjectColumnFilter(field: string, event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    if (!targetElement) {
      return;
    }

    this.currentProjectFilterField = field;
    // Initialize filter values if not exists
    if (!this.projectColumnFilterValues[field]) {
      this.projectColumnFilterValues[field] = [];
    }
    event.stopPropagation();

    this.openFilterPopover(this.projectColumnFilterPopover, targetElement);
  }

  // Get filter value for a project column
  getProjectColumnFilterValue(field: string): string[] {
    return this.projectColumnFilterValues[field] || [];
  }

  // Get unique values for a project column
  getUniqueValuesForProjectColumn(field: string): string[] {
    if (!Array.isArray(this.projects) || this.projects.length === 0) {
      return [];
    }

    const uniqueValues = new Set<string>();

    this.projects.forEach((project) => {
      let value: string = '';
      
      if (field === 'formattedZeitraum') {
        value = project.zeitraum || '';
      } else if (field === 'filialen') {
        // Match the exact format displayed in the template: "{{ project.branchesCount }} Stores"
        const count = project.branchesCount ?? 0;
        value = `${count} Stores`;
      } else if (field === 'status') {
        const percentage = project.reportedPercentage ?? 0;
        value = `${percentage}% reported`;
      } else {
        value = project[field as keyof Project]?.toString() || '';
      }

      if (value) {
        uniqueValues.add(value);
      }
    });

    return Array.from(uniqueValues).sort();
  }

  // Get column header for project columns
  getProjectColumnHeader(field: string): string {
    const col = this.cols.find(c => c.field === field);
    return col ? col.header : field;
  }

  // Handle project column filter change
  onProjectColumnFilterChange(): void {
    this.applyFilters();
  }

  // Check if any project column filters are active
  hasProjectColumnFilters(): boolean {
    return Object.keys(this.projectColumnFilterValues).some(
      key => this.projectColumnFilterValues[key] && 
      Array.isArray(this.projectColumnFilterValues[key]) && 
      this.projectColumnFilterValues[key].length > 0
    );
  }

  hasReportColumnFilters(): boolean {
    return (this.reportStatusFilter && this.reportStatusFilter.length > 0) ||
           (this.reportMerchandiserFilter && this.reportMerchandiserFilter.length > 0) ||
           (this.reportFilialenFilter && this.reportFilialenFilter.length > 0) ||
           (this.reportPlannedOnFilter && this.reportPlannedOnFilter.length > 0) ||
           Object.keys(this.genericFilterValues).some(
             key => this.genericFilterValues[key] && 
             Array.isArray(this.genericFilterValues[key]) && 
             this.genericFilterValues[key].length > 0
           );
  }

  hasActiveSorts(): boolean {
    return this.projectSortField !== '' || this.reportSortField !== '';
  }

  // Clear all filters
  clearFilters(): void {
    this.statusFilter = '';
    this.clientSearchTerm = '';
    this.projectSearchTerm = '';
    this.projectNameFilter = [];
    this.projectColumnFilterValues = {};
    this.filialeSearchTerm = '';
    this.dateRange2 = { start: null, end: null };
    this.reportPlannedOnFilter = [];
    
    // Clear report column filters
    // Note: We do NOT clear expandedRows here to keep projects expanded when clearing filters
    this.reportStatusFilter = [];
    this.reportMerchandiserFilter = [];
    this.reportFilialenFilter = [];
    this.genericFilterValues = {};
    
    // Clear sort fields
    this.projectSortField = '';
    this.projectSortOrder = 1;
    this.reportSortField = '';
    this.reportSortOrder = 1;
    
    // Update URL to remove status filter
    const queryParams = this.buildFilterQueryParams({ status: undefined });
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge',
    });
    
    // Note: We do NOT clear expandedRows or selectedProject here
    // to keep projects expanded when clearing filters
    
    this.filteredProjects = [...this.projects];
    
    // Reload reports for all expanded projects without filters
    this.reloadReportsForExpandedProjects();
  }

  /**
   * Check if a project matches the status filter
   * @param project The project to check
   * @returns true if the project matches the status filter
   */
  private projectMatchesStatusFilter(project: Project): boolean {
    if (!this.statusFilter || !project.reports) {
      return true; // No filter or no reports to check
    }

    // Check if any report in the project matches the status filter
    return project.reports.some((report) => {
      if (!report.status) {
        return false;
      }

      // Handle different status filter values
      switch (this.statusFilter.toLowerCase()) {
        case 'new':
          // Filter for new reports (you can define what "new" means)
          // For example, reports without feedback or with status 'PENDING'
          return !report.feedback && (report.status.name === 'PENDING' || !report.status.name);

        case 'pending':
          return report.status.name === 'PENDING';

        case 'completed':
          return report.status.name === 'COMPLETED' || report.feedback;

        case 'delivered':
          return report.status.name === 'DELIVERED';

        default:
          // For any other status, do exact match
          return report.status.name?.toLowerCase() === this.statusFilter.toLowerCase();
      }
    });
  }

  /**
   * Get formatted status filter for display in heading
   */
  getStatusFilterDisplay(): string {
    if (!this.statusFilter) {
      return '';
    }
    // Capitalize first letter and keep the rest lowercase
    return this.statusFilter.charAt(0).toUpperCase() + this.statusFilter.slice(1).toLowerCase();
  }

  /**
   * Get the current status filter value
   * @returns The status filter value
   */
  getStatusFilter(): string {
    return this.statusFilter;
  }

  private loadClient(): void {
    const clientId = this.route.snapshot.paramMap.get('id') || this.route.snapshot.paramMap.get('clientId');
    if (clientId) {
      // this.client is set from the backend response in ngOnInit
    }
  }

  // Bulk insert reports for a project using uploaded CSV data
  bulkInsertCsvReports(project: Project): void {
    if (!project || !project.id || !this.uploadedCsvData.length) {
      console.warn('No project selected or no CSV data to insert.');
      return;
    }
    this.reportService.bulkInsertReports(project.id, this.uploadedCsvData).subscribe({
      next: (response) => {
        console.log('Bulk insert successful:', response);
        this.dialogMessage = 'CSV erfolgreich hochgeladen';
        this.csvDialogIsError = false;
        this.csvDialogVisible = true;
      },
      error: (error) => {
        console.error('Bulk insert failed:', error);
        this.dialogMessage = 'Bulk-Insert fehlgeschlagen!';
        this.csvDialogIsError = true;
        this.csvDialogVisible = true;
      },
    });
  }

  // Excel upload button handler
  openExcelUploader(project: Project): void {
    this.selectedProject = project;
    if (this.excelFileInput) {
      this.excelFileInput.nativeElement.value = '';
      this.excelFileInput.nativeElement.click();
    }
  }

  // Excel test upload button handler
  openExcelTestUploader(project: Project): void {
    this.selectedProject = project;
    if (this.excelTestFileInput) {
      this.excelTestFileInput.nativeElement.value = '';
      this.excelTestFileInput.nativeElement.click();
    }
  }

  // Helper: map Excel row to structured object
  /**
   * Convert Excel date serial number to date string (DD/MM/YYYY format)
   * Excel stores dates as days since 1899-12-30
   */
  private convertExcelDateToDateString(value: any): string {
    // If it's already a string, try to parse it or return as is
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // If it's already a valid date string format, return it
      if (trimmed && (trimmed.includes('/') || trimmed.includes('-') || trimmed.includes('.'))) {
        return trimmed;
      }
      // Try to parse as number
      const numValue = parseFloat(trimmed);
      if (!isNaN(numValue)) {
        value = numValue;
      } else {
        return trimmed; // Return as is if it's a string but not a number
      }
    }

    // If it's a number (Excel serial date), convert it
    if (typeof value === 'number' && !isNaN(value) && value > 0) {
      // Excel epoch: December 30, 1899
      const excelEpoch = new Date(1899, 11, 30);
      // Calculate the actual date
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      
      // Format as DD/MM/YYYY
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    }

    // Return empty string if value is invalid
    return '';
  }

  private mapExcelRowToReport(row: any): any {
    const branchNumberHeaders = ['FILIALNUMMER', 'Filialnummer', 'FILIAL NR', 'Filial Nr', 'BRANCH NUMBER', 'Branch Number'];
    const branchNumber = branchNumberHeaders.map((header) => (row[header] !== undefined ? String(row[header]).trim() : '')).find((value) => value.length > 0) || '';

    // Helper function to get value from row with multiple possible header variations
    const getValue = (possibleHeaders: string[]): string => {
      for (const header of possibleHeaders) {
        if (row[header] !== undefined && row[header] !== null && row[header] !== '') {
          const value = String(row[header]).trim();
          if (value.length > 0) {
            return value;
          }
        }
      }
      // Also try to find by partial match (case insensitive)
      const rowKeys = Object.keys(row);
      for (const header of possibleHeaders) {
        const headerLower = header.toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        for (const key of rowKeys) {
          const keyLower = key.toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          if (keyLower.includes(headerLower) || headerLower.includes(keyLower)) {
            const value = String(row[key]).trim();
            if (value.length > 0) {
              return value;
            }
          }
        }
      }
      return '';
    };

    // Helper function to get date value (handles both Excel serial numbers and date strings)
    const getDateValue = (possibleHeaders: string[]): string => {
      for (const header of possibleHeaders) {
        if (row[header] !== undefined && row[header] !== null && row[header] !== '') {
          return this.convertExcelDateToDateString(row[header]);
        }
      }
      // Also try to find by partial match (case insensitive)
      const rowKeys = Object.keys(row);
      for (const header of possibleHeaders) {
        const headerLower = header.toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        for (const key of rowKeys) {
          const keyLower = key.toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          if (keyLower.includes(headerLower) || headerLower.includes(keyLower)) {
            return this.convertExcelDateToDateString(row[key]);
          }
        }
      }
      return '';
    };

    // Map static fields with multiple possible header variations
    const mapped: any = {
      branchNumber,
      branch: getValue(['FILIALE\n(Text)', 'FILIALE (Text)', 'Filiale', 'FILIALE', 'Branch', 'BRANCH', 'Filiale (Text)']),
      street: getValue(['STRABE +\nHAUSNUM\nMER', 'STRABE + HAUSNUM MER', 'Straße', 'STRASSE', 'Street', 'STREET', 'Straße + Hausnummer', 'STRABE + HAUSNUM MER']),
      zip: getValue(['PLZ', 'Postleitzahl', 'ZIP', 'Zip Code', 'ZIP Code']),
      city: getValue(['ORT', 'City', 'CITY', 'Stadt']),
      country: getValue(['LAND', 'Country', 'COUNTRY', 'Land']),
      phone: getValue(['TELEFON\nFILIALE\n(Text)', 'TELEFON FILIALE (Text)', 'Telefon', 'TELEFON', 'Phone', 'PHONE', 'Telefon Filiale']),
      note: getValue(['NOTIZ\n(Text)', 'NOTIZ (Text)', 'Notiz', 'NOTIZ', 'Note', 'NOTE']),
      merchandiser: getValue(['MERCHANDISER\n(Text)', 'MERCHANDISER (Text)', 'Merchandiser', 'MERCHANDISER']),
      plannedOn: getDateValue(['BESUCHSDATUM', 'Besuchsdatum', 'Planned On', 'PLANNED ON', 'Visit Date']),
      reportTo: getDateValue(['Report bis', 'Report Bis', 'REPORT BIS', 'Report To', 'REPORT TO']),
      isSpecCompliant: (getValue(['Alles nach Vorgabe?\n1. JA\n2. NEIN', 'Alles nach Vorgabe?', 'Alles nach Vorgabe', 'Spec Compliant']).toLowerCase() === 'ja'),
      feedback: (getValue(['Feedback\n1. JA\n2. NEIN', 'Feedback', 'FEEDBACK']).toLowerCase() === 'ja'),
      questions: [],
    };
    // Extract questions
    Object.keys(row).forEach((key) => {
      if (key.startsWith('FRAGE')) {
        // Extract only the first line inside the quotes as the question text
        const match = key.match(/^FRAGE \d+:\n\"([\s\S]+?)\"/);
        let questionText = key;
        if (match) {
          // Take only the first line (before any \n)
          questionText = match[1].split('\n')[0].trim();
        }
        let answer = row[key];
        // If answer is 'Ja'/'Nein', convert to boolean
        if (answer === 'Ja') answer = true;
        else if (answer === 'Nein') answer = false;
        // If answer is comma-separated, convert to array
        else if (typeof answer === 'string' && answer.includes(',')) answer = answer.split(',').map((s: string) => s.trim());
        mapped.questions.push({ question: questionText, answer });
      }
    });
    return mapped;
  }

  // Handle Excel file upload (for real bulk insert, but for now just log)
  handleExcelFileUpload(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (file && this.selectedProject) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        const mapped = json.map((row) => this.mapExcelRowToReport(row));
        // Call bulk insert logic
        this.reportService.bulkInsertReports(this.selectedProject.id, mapped).subscribe({
          next: (response) => {
            this.dialogMessage = 'Excel erfolgreich hochgeladen';
            this.csvDialogIsError = false;
            this.csvDialogVisible = true;
            // Refresh projects list after bulk insert
            if (this.client && this.client.id) {
              this.clientCompanyService.getProjectsByClientCompany(this.client.id).subscribe({
                next: (resp) => {
                  this.projects = resp.projects || [];
                  // applyFilters also preloads reports for all filtered projects
                  this.applyFilters();
                  
                  // Collapse all expanded rows and clear selected project
                  this.expandedRows = {};
                  this.selectedProject = null;
                },
                error: () => {
                  this.projects = [];
                  this.filteredProjects = [];
                  this.expandedRows = {};
                  this.selectedProject = null;
                },
              });
            } else {
              // Fallback: just collapse
              this.expandedRows = {};
              this.selectedProject = null;
            }
          },
          error: (error) => {
            this.dialogMessage = 'Bulk-Insert fehlgeschlagen!';
            this.csvDialogIsError = true;
            this.csvDialogVisible = true;
          },
        });
        // Reset file input
        fileInput.value = '';
      };
      reader.readAsArrayBuffer(file);
    }
  }

  // Handle Excel file upload for test (just log the parsed data)
  handleExcelTestFileUpload(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        const mapped = json.map((row) => this.mapExcelRowToReport(row));
        console.log('Excel mapped data (TEST ONLY):', mapped);
      };
      reader.readAsArrayBuffer(file);
    }
  }

  /**
   * Filter reports for a project based on the status filter
   * @param project The project to filter reports for
   * @returns Filtered reports array
   */
  filteredReports(project: Project): Report[] {
    if (!project.reports) {
      return [];
    }

    let filtered = project.reports;

    // Apply general status filter from query params
    if (this.statusFilter) {
      filtered = filtered.filter((report) => this.reportMatchesStatus(report, this.statusFilter));
    }

    // Apply column status filter (multiple selection)
    if (this.reportStatusFilter && Array.isArray(this.reportStatusFilter) && this.reportStatusFilter.length > 0) {
      filtered = filtered.filter((report) => {
        return report.status?.name && this.reportStatusFilter.includes(report.status.name);
      });
    }

    // Apply column merchandiser filter (multiple selection)
    if (this.reportMerchandiserFilter && Array.isArray(this.reportMerchandiserFilter) && this.reportMerchandiserFilter.length > 0) {
      filtered = filtered.filter((report) => {
        const merchandiserName = this.getReportMerchandiserName(report);
        return merchandiserName && this.reportMerchandiserFilter.includes(merchandiserName);
      });
    }

    // Apply column filialen filter (multiple selection)
    if (this.reportFilialenFilter && Array.isArray(this.reportFilialenFilter) && this.reportFilialenFilter.length > 0) {
      filtered = filtered.filter((report) => {
        const branchLabel = this.getReportBranchLabel(report);
        return branchLabel && this.reportFilialenFilter.includes(branchLabel);
      });
    }

    // Apply column plannedOn date filter (multiple selection)
    if (this.reportPlannedOnFilter && Array.isArray(this.reportPlannedOnFilter) && this.reportPlannedOnFilter.length > 0) {
      filtered = filtered.filter((report) => {
        if (!report.plannedOn) return false;
        const formattedDate = this.formatDateForFilter(report.plannedOn);
        return formattedDate && this.reportPlannedOnFilter.includes(formattedDate);
      });
    }

    // Apply generic filters for other columns
    Object.keys(this.genericFilterValues).forEach((field) => {
      const filterValues = this.genericFilterValues[field];
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter((report) => {
          const value = this.getReportFieldValue(report, field);
          return value && filterValues.includes(value);
        });
      }
    });

    return filtered;
  }

  /**
   * Get unique status values from a project's reports
   * @param project The project to get statuses from (optional, defaults to selectedProject)
   * @returns Array of unique status objects
   */
  getUniqueReportStatuses(project?: Project): Array<{ name: string; color: string }> {
    const projectToUse = project || this.selectedProject;

    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const statusMap = new Map<string, string>();

    projectToUse.reports.forEach((report) => {
      if (report.status?.name) {
        statusMap.set(report.status.name, report.status.color || '#cccccc');
      }
    });

    return Array.from(statusMap.entries()).map(([name, color]) => ({ name, color }));
  }

  /**
   * Get unique merchandiser values from a project's reports
   * @param project The project to get merchandisers from (optional, defaults to selectedProject)
   * @returns Array of unique merchandiser names
   */
  getUniqueMerchandisers(project?: Project): string[] {
    const projectToUse = project || this.selectedProject;

    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const merchandiserSet = new Set<string>();

    projectToUse.reports.forEach((report) => {
      const merchandiserName = this.getReportMerchandiserName(report);
      if (merchandiserName && merchandiserName !== '-') {
        merchandiserSet.add(merchandiserName);
      }
    });

    return Array.from(merchandiserSet).sort();
  }

  /**
   * Get unique filialen (branch) values from a project's reports
   * @param project The project to get branches from (optional, defaults to selectedProject)
   * @returns Array of unique branch names
   */
  getUniqueFilialen(project?: Project): string[] {
    const projectToUse = project || this.selectedProject;

    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const branchSet = new Set<string>();

    projectToUse.reports.forEach((report) => {
      const label = this.getReportBranchLabel(report);
      if (label) {
        branchSet.add(label);
      }
    });

    return Array.from(branchSet).sort();
  }

  /**
   * Clear the report status column filter
   */
  clearReportStatusFilter(): void {
    this.reportStatusFilter = [];
  }

  /**
   * Clear the report merchandiser column filter
   */
  clearReportMerchandiserFilter(): void {
    this.reportMerchandiserFilter = [];
  }

  /**
   * Clear the report filialen column filter
   */
  clearReportFilialenFilter(): void {
    this.reportFilialenFilter = [];
  }

  /**
   * Get unique plannedOn dates from a project's reports
   * @param project The project to get dates from (optional, defaults to selectedProject)
   * @returns Array of unique formatted date strings
   */
  getUniquePlannedOnDates(project?: Project): string[] {
    const projectToUse = project || this.selectedProject;

    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const dateSet = new Set<string>();

    projectToUse.reports.forEach((report) => {
      if (report.plannedOn) {
        const formattedDate = this.formatDateForFilter(report.plannedOn);
        if (formattedDate) {
          dateSet.add(formattedDate);
        }
      }
    });

    return Array.from(dateSet).sort();
  }

  /**
   * Format a date for filtering (consistent format)
   */
  private formatDateForFilter(date: string | Date): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    // Format as DD.MM.YYYY (EU format)
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }

  /**
   * Open generic filter popover for a field
   */
  openGenericFilter(field: string, event: Event): void {
    // Store the actual DOM element for positioning - use currentTarget (the div wrapper)
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    
    if (!targetElement) {
      return;
    }

    this.currentFilterField = field;
    // Initialize filter values if not exists
    if (!this.genericFilterValues[field]) {
      this.genericFilterValues[field] = [];
    }
    
    event.stopPropagation();

    this.openFilterPopover(this.genericFilterPopover, targetElement);
  }

  /**
   * Close all filter popovers
   */
  closeAllFilterPopovers(): void {
    this.hideFilterPopovers();
    this.hideSettingsPopovers();
  }

  private hideFilterPopovers(except?: any): void {
    const popovers = [
      this.genericFilterPopover,
      this.projectColumnFilterPopover,
      this.statusFilterPopover,
      this.merchandiserFilterPopover,
      this.filialenFilterPopover,
      this.plannedOnFilterPopover,
      this.projectFilterPopover,
    ];

    popovers.forEach((popover) => {
      if (popover && popover !== except) {
        popover.hide();
      }
    });

    if (!except) {
      this.activeFilterPopover = null;
    } else if (this.activeFilterPopover && this.activeFilterPopover !== except) {
      this.activeFilterPopover = null;
    }
  }

  private hideSettingsPopovers(except?: any): void {
    const popovers = [this.projectSettingsPopover, this.reportSettingsPopover];

    popovers.forEach((popover) => {
      if (popover && popover !== except) {
        popover.hide();
      }
    });

    if (!except) {
      this.activeSettingsPopover = null;
    } else if (this.activeSettingsPopover && this.activeSettingsPopover !== except) {
      this.activeSettingsPopover = null;
    }
  }

  private showFilterPopover(popoverRef: any, targetElement: HTMLElement): void {
    if (!popoverRef || !targetElement) {
      return;
    }

    const positioningEvent = {
      currentTarget: targetElement,
      target: targetElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as any;

    popoverRef.hide();
    this.activeFilterPopover = null;

    setTimeout(() => {
      popoverRef.show(positioningEvent);
      this.activeFilterPopover = popoverRef;
    }, 120);
  }

  private openFilterPopover(popoverRef: any, targetElement: HTMLElement): void {
    this.hideSettingsPopovers();
    this.hideFilterPopovers(popoverRef);
    this.showFilterPopover(popoverRef, targetElement);
  }

  toggleProjectSettingsPopover(event: Event): void {
    this.toggleSettingsPopover(this.projectSettingsPopover, event);
  }

  toggleReportSettingsPopover(event: Event): void {
    this.toggleSettingsPopover(this.reportSettingsPopover, event);
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

    this.hideFilterPopovers();
    this.hideSettingsPopovers(popoverRef);

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

  onSettingsPopoverClose(popoverRef: any, event?: Event): void {
    event?.stopPropagation();
    if (popoverRef) {
      popoverRef.hide();
      if (this.activeSettingsPopover === popoverRef) {
        this.activeSettingsPopover = null;
      }
    }
  }


  /**
   * Open status filter popover
   */
  openStatusFilter(event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) {
      return;
    }
    event.stopPropagation();

    this.openFilterPopover(this.statusFilterPopover, targetElement);
  }

  /**
   * Open merchandiser filter popover
   */
  openMerchandiserFilter(event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) {
      return;
    }
    event.stopPropagation();

    this.openFilterPopover(this.merchandiserFilterPopover, targetElement);
  }

  /**
   * Open filialen filter popover
   */
  openFilialenFilter(event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) {
      return;
    }
    event.stopPropagation();

    this.openFilterPopover(this.filialenFilterPopover, targetElement);
  }

  /**
   * Open plannedOn filter popover
   */
  openPlannedOnFilter(event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) {
      return;
    }
    event.stopPropagation();

    this.openFilterPopover(this.plannedOnFilterPopover, targetElement);
  }

  /**
   * Open project filter popover
   */
  openProjectFilter(event: Event): void {
    const targetElement = (event.currentTarget || event.target) as HTMLElement;
    if (!targetElement) {
      return;
    }
    event.stopPropagation();

    this.openFilterPopover(this.projectFilterPopover, targetElement);
  }

  /**
   * Get unique values for a specific field across all reports in the selected project
   */
  getUniqueValuesForField(field: string): string[] {
    const projectToUse = this.selectedProject;
    if (!projectToUse || !projectToUse.reports) {
      return [];
    }

    const valueSet = new Set<string>();

    projectToUse.reports.forEach((report) => {
      const value = this.getReportFieldValue(report, field);
      if (value && value !== '-' && value !== '') {
        valueSet.add(value);
      }
    });

    return Array.from(valueSet).sort();
  }

  /**
   * Get the column header for a field
   */
  getColumnHeader(field: string): string {
    const col = this.reportCols.find((c) => c.field === field);
    return col ? col.header : field;
  }

  /**
   * Get the generic filter value for a field
   */
  getGenericFilterValue(field: string): string[] {
    return this.genericFilterValues[field] || [];
  }

  /**
   * Get the value of a report field for filtering
   */
  private getReportFieldValue(report: Report, field: string): string {
    if (field === 'address') {
      return this.getReportAddress(report);
    }
    if (field === 'isSpecCompliant') {
      return report.isSpecCompliant ? 'Ja' : '';
    }
    if (field === 'feedback') {
      return report.feedback === true || report.feedback === 'true' ? 'Ja' : '';
    }
    if (field === 'reportTo') {
      return report.reportTo || '';
    }
    if (field === 'note') {
      return report.note || '';
    }
    if (field === 'plannedOn') {
      return report.plannedOn || '';
    }
    
    // Handle nested fields
    if (field.includes('.')) {
      const parts = field.split('.');
      let value: any = report;
      for (const part of parts) {
        value = value?.[part];
      }
      return value ? String(value) : '';
    }

    return report[field as keyof Report] ? String(report[field as keyof Report]) : '';
  }

  /**
   * Check if a report matches the specified status filter
   * @param report The report to check
   * @param statusFilter The status filter value
   * @returns true if the report matches the status filter
   */
  private reportMatchesStatus(report: Report, statusFilter: string): boolean {
    if (!report.status) {
      return false;
    }

    // Handle different status filter values - matching backend logic using enum
    switch (statusFilter.toLowerCase()) {
      case 'new':
        // Filter for new reports - NEW or ASSIGNED status (matching backend)
        return report.status.id === ReportStatusEnum.NEW || report.status.id === ReportStatusEnum.ASSIGNED;

      case 'completed':
        // Filter for completed reports - VALID status (matching backend)
        return report.status.id === ReportStatusEnum.VALID;

      case 'ongoing':
        // Filter for ongoing reports - all other statuses: DRAFT, IN_PROGRESS, DUE, FINISHED, OPENED_BY_CLIENT (matching backend)
        return [ReportStatusEnum.DRAFT, ReportStatusEnum.IN_PROGRESS, ReportStatusEnum.DUE, ReportStatusEnum.FINISHED, ReportStatusEnum.OPENED_BY_CLIENT, ReportStatusEnum.ACCEPTED].includes(
          report.status.id,
        );

      default:
        // For any other status, do exact match by name
        return report.status.name?.toLowerCase() === statusFilter.toLowerCase();
    }
  }

  /**
   * Clear the status filter and refresh the view
   */
  clearStatusFilter(): void {
    this.statusFilter = '';

    // Navigate back to the same route without the status query parameter
    if (this.client) {
      this.navigateBackToClient();
    }
  }
}
