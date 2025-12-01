import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '../../shared/app-icon.component';
import { FavoriteToggleComponent } from '@app/shared/components/favorite-toggle/favorite-toggle.component';
import { DateRangePickerComponent } from '@app/shared/components/date-range-picker/date-range-picker.component';
import { DashboardService, DashboardProject } from '@app/core/services/dashboard.service';
import { ProjectService } from '@app/@core/services/project.service';
import { HotToastService } from '@ngneat/hot-toast';
import { catchError, of } from 'rxjs';
import { RouterModule } from '@angular/router';
@Component({
  selector: 'app-dashboard',
  imports: [TranslateModule, ImportsModule, AppIconComponent, DateRangePickerComponent, FavoriteToggleComponent, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
  // Filter states
  activeFilter: 'all' | 'running' | 'completed' | 'favorites' = 'all';
  dateRange = { start: null, end: null };

  // API data
  projects: DashboardProject[] = [];
  loading = true;
  error = false;

  // Computed properties for templates
  get favoriteProjects(): DashboardProject[] {
    return this.projects.filter((project) => project.isFavorite);
  }

  get nonFavoriteProjects(): DashboardProject[] {
    return this.projects.filter((project) => !project.isFavorite);
  }

  // Add computed property for favorite projects in filtered results
  get favoriteFilteredProjects(): DashboardProject[] {
    return this.filteredProjects.filter((project) => project.isFavorite);
  }

  // Add computed property for non-favorite projects in filtered results
  get nonFavoriteFilteredProjects(): DashboardProject[] {
    return this.filteredProjects.filter((project) => !project.isFavorite);
  }

  // Add this computed property for filtered projects
  get filteredProjects(): DashboardProject[] {
    return this.projects.filter((project) => {
      // Filter by favorites
      if (this.activeFilter === 'favorites' && !project.isFavorite) {
        return false;
      }

      // Filter by status (skip if filtering by favorites)
      if (this.activeFilter !== 'all' && this.activeFilter !== 'favorites' && project.status !== this.activeFilter) {
        return false;
      }

      // Filter by date range if dates are selected
      if (this.dateRange.start && this.dateRange.end) {
        // Parse project dates
        const projectStartDate = new Date(project.startDate);
        const projectEndDate = new Date(project.endDate);

        // Check if project date range overlaps with selected range
        if (projectEndDate < this.dateRange.start || projectStartDate > this.dateRange.end) {
          return false;
        }
      }

      return true;
    });
  }

  constructor(
    private router: Router,
    private dashboardService: DashboardService,
    private projectService: ProjectService,
    private toast: HotToastService,
  ) {}

  ngOnInit() {
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    this.loading = true;
    this.error = false;

    this.dashboardService
      .getDashboardData()
      .pipe(
        catchError((error) => {
          console.error('Error loading dashboard data:', error);
          this.error = true;
          this.toast.error('Fehler beim Laden der Dashboard-Daten', {
            position: 'bottom-right',
            duration: 4000,
          });
          return of(null);
        }),
      )
      .subscribe({
        next: (data) => {
          if (data) {
            // Transform the API data to add computed properties
            this.projects = (data.assignedProjects || []).map((project) => this.transformProject(project));
            console.log('✅ Dashboard data loaded:', {
              projectsCount: this.projects.length,
              projects: this.projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
            });
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  /**
   * Transform raw project data from API to include computed properties
   */
  private transformProject(project: DashboardProject): DashboardProject {
    const startDate = new Date(project.startDate);
    const endDate = new Date(project.endDate);
    const today = new Date();

    // Determine status based on dates
    let status: 'running' | 'completed' = 'running';
    // A project is completed only if its end date has passed
    if (endDate < today) {
      status = 'completed';
    }

    // Generate date range string
    const dateRange = `${startDate.getDate().toString().padStart(2, '0')}.${(startDate.getMonth() + 1).toString().padStart(2, '0')}. - ${endDate.getDate().toString().padStart(2, '0')}.${(endDate.getMonth() + 1).toString().padStart(2, '0')}.${endDate.getFullYear()}`;

    // Generate week number
    const weekNumber = `KW ${this.getWeekNumber(startDate)}`;

    // Generate slug from name
    const slug = project.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Use real report counts from API data
    const stats = {
      new: project.reportCounts.newReports,
      open: project.reportCounts.ongoingReports,
      completed: project.reportCounts.completedReports,
    };

    return {
      ...project,
      slug,
      dateRange,
      weekNumber,
      status,
      isFavorite: project.isFavorite || false, // Use the actual isFavorite value from API
      stats,
    };
  }

  /**
   * Get week number for a date
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  // Filter methods
  setFilter(filter: 'all' | 'running' | 'completed'): void {
    this.activeFilter = filter;
  }

  // Handle date range selection
  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    this.dateRange = range;
  }

  hasActiveFilters(): boolean {
    return this.activeFilter !== 'all' || !!this.dateRange.start || !!this.dateRange.end;
  }

  clearFilters(): void {
    this.activeFilter = 'all';
    this.dateRange = { start: null, end: null };
  }

  // Handle favorite toggle
  onFavoriteChanged(newStatus: boolean, project: DashboardProject): void {
    console.log('🔄 Toggling project favorite status:', { id: project.id, newStatus });

    // Optimistically update the UI
    const previousStatus = project.isFavorite;
    project.isFavorite = newStatus;

    // Call backend to toggle favorite status using ProjectService
    this.projectService
      .toggleFavoriteStatus(project.id.toString())
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling project favorite status:', error);

          // Revert the optimistic update on error
          project.isFavorite = previousStatus;

          this.toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });

          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Project favorite status updated:', result);

            // Update the status based on server response
            project.isFavorite = result.isFavorite;

            this.toast.success(result.message, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }

  // Add these methods for filter buttons
  showAllClients(): void {
    this.clearFilters();
  }

  showRunningProjects(): void {
    this.activeFilter = 'running';
  }

  showCompletedProjects(): void {
    this.activeFilter = 'completed';
  }

  /**
   * Navigate to project detail without any filters
   */
  navigateToProject(project: DashboardProject, newTab: boolean = false): void {
    if (newTab) {
      const urlTree = this.router.createUrlTree(['/projects', project.id]);
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/projects', project.id]);
    }
  }

  /**
   * Navigate to project reports filtered by specific type
   */
  navigateToProjectReports(project: DashboardProject, reportType: 'new' | 'ongoing' | 'completed', newTab: boolean = false): void {
    // Map internal report types to API report types
    const apiReportType = reportType === 'ongoing' ? 'ongoingReports' : reportType === 'new' ? 'newReports' : 'completedReports';

    if (newTab) {
      const urlTree = this.router.createUrlTree(['/projects', project.id], {
        queryParams: { reportFilter: apiReportType },
      });
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/projects', project.id], {
        queryParams: { reportFilter: apiReportType },
      });
    }
  }

  openProjectInNewTab(project: DashboardProject): void {
    this.navigateToProject(project, true);
  }

  openProjectReportsInNewTab(project: DashboardProject, reportType: 'new' | 'ongoing' | 'completed'): void {
    this.navigateToProjectReports(project, reportType, true);
  }

  onProjectContextMenu(event: MouseEvent, project: DashboardProject): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openProjectInNewTab(project);
    return false;
  }

  onProjectReportsContextMenu(event: MouseEvent, project: DashboardProject, reportType: 'new' | 'ongoing' | 'completed'): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openProjectReportsInNewTab(project, reportType);
    return false;
  }
}
