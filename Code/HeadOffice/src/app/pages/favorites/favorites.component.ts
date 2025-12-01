import { Component, OnInit } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule, Router } from '@angular/router';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '../../shared/app-icon.component';
import { FavoriteToggleComponent } from '../../shared/components/favorite-toggle/favorite-toggle.component';
import { FavoritesService, FavoriteClientCompany, FavoriteReport } from '@app/core/services/favorites.service';
import { HotToastService } from '@ngxpert/hot-toast';
import { catchError, of } from 'rxjs';

interface ReportCounts {
  newReports: number;
  ongoingReports: number;
  completedReports: number;
}

interface FavoriteClientCompanyWithCounts extends FavoriteClientCompany {
  reportCounts?: ReportCounts;
}

@Component({
  selector: 'app-favorites',
  imports: [TranslateModule, RouterModule, ImportsModule, AppIconComponent, FavoriteToggleComponent],
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.scss',
})
export class FavoritesComponent implements OnInit {
  favoriteClientCompanies: FavoriteClientCompanyWithCounts[] = [];
  favoriteReports: FavoriteReport[] = [];
  loading = true;
  error = false;

  constructor(
    private favoritesService: FavoritesService,
    private toast: HotToastService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadFavorites();
  }

  loadFavorites(): void {
    this.loading = true;
    this.error = false;

    this.favoritesService
      .getFavorites()
      .pipe(
        catchError((error) => {
          console.error('Error loading favorites:', error);
          this.error = true;
          this.toast.error('Fehler beim Laden der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });
          return of(null);
        }),
      )
      .subscribe({
        next: (data) => {
          if (data) {
            // Transform client companies to include report counts
            this.favoriteClientCompanies = (data.favoriteClientCompanies || []).map((client) => ({
              ...client,
              reportCounts: (client as any).reportCounts,
            }));
            this.favoriteReports = data.favoriteReports || [];
          }
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  onFavoriteChanged(newStatus: boolean, item: any, type: 'client' | 'report'): void {
    console.log('🔄 Toggling favorite status:', { id: item.id, type, newStatus });

    // Optimistically update the UI
    const previousStatus = item.isFavorite;
    item.isFavorite = newStatus;

    // Call the appropriate service method based on type
    if (type === 'client') {
      this.favoritesService.toggleClientCompanyFavorite(item.id).subscribe({
        next: (response) => {
          console.log('✅ Client favorite status updated:', response);
          this.toast.success(response.message, {
            position: 'bottom-right',
            duration: 2000,
          });
          // Keep the current state - no reloading
        },
        error: (error) => {
          console.error('❌ Error toggling client company favorite:', error);
          // Revert the optimistic update on error
          item.isFavorite = previousStatus;
          this.toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });
        },
      });
    } else if (type === 'report') {
      this.favoritesService.toggleReportFavorite(item.id).subscribe({
        next: (response) => {
          console.log('✅ Report favorite status updated:', response);
          this.toast.success(response.message, {
            position: 'bottom-right',
            duration: 2000,
          });
          // Keep the current state - no reloading
        },
        error: (error) => {
          console.error('❌ Error toggling mission favorite:', error);
          // Revert the optimistic update on error
          item.isFavorite = previousStatus;
          this.toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });
        },
      });
    }
  }

  // Helper method to get branch label with number
  getBranchLabel(report: FavoriteReport): string {
    if (!report.branch) {
      return 'Keine Filiale';
    }

    const branchNumber = (report.branch as any)?.branchNumber?.toString().trim() || '';
    const branchName = report.branch.name?.trim() || '';

    if (branchNumber && branchName) {
      return `#${branchNumber}  ${branchName}`;
    }

    return branchNumber || branchName || 'Unbekannte Filiale';
  }

  // Helper method to get report address
  getReportAddress(report: FavoriteReport): string {
    const parts: string[] = [];
    if (report.street) parts.push(report.street);
    if (report.zipCode) parts.push(report.zipCode);
    if (report.branch?.client?.name) parts.push(report.branch.client.name);
    return parts.length > 0 ? parts.join(', ') : '';
  }

  // Helper method to format planned date
  getPlannedDate(report: FavoriteReport): string {
    if (!report.plannedOn) return '';
    const date = new Date(report.plannedOn);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // Helper method to format report period
  getReportPeriod(report: FavoriteReport): string {
    const startDate = new Date(report.project.startDate);
    const endDate = new Date(report.project.endDate);

    // Get the week number
    const weekNumber = this.getWeekNumber(startDate);

    // Format dates in German format (dd.MM.yyyy)
    const startDateFormatted = startDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const endDateFormatted = endDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return `KW ${weekNumber} ${startDateFormatted} bis ${endDateFormatted}`;
  }

  // Navigate to report detail
  navigateToReport(report: FavoriteReport, newTab: boolean = false): void {
    if (!report.clientCompany?.id || !report.project?.id || !report.id) {
      return;
    }

    const queryParams = {
      reportStatus: report.status?.name || '',
      referrer: 'favorites',
    };

    if (newTab) {
      const urlTree = this.router.createUrlTree(['/clients', report.clientCompany.id, 'projects', report.project.id, 'reports', report.id], { queryParams });
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/clients', report.clientCompany.id, 'projects', report.project.id, 'reports', report.id], {
        queryParams,
      });
    }
  }

  openClientInNewTab(clientId: number, queryParams?: Record<string, any>): void {
    const urlTree = this.router.createUrlTree(['/clients', clientId], { queryParams: queryParams || {} });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  onReportContextMenu(event: MouseEvent, report: FavoriteReport): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.navigateToReport(report, true);
    return false;
  }

  onClientContextMenu(event: MouseEvent, clientId: number, queryParams?: Record<string, any>): boolean {
    event.preventDefault();
    event.stopPropagation();
    this.openClientInNewTab(clientId, queryParams);
    return false;
  }

  // Helper method to get week number
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}
