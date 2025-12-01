import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface DashboardProject {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  reportCounts: {
    newReports: number;
    ongoingReports: number;
    completedReports: number;
  };
  // Computed properties that we'll add in the component
  slug?: string;
  dateRange?: string;
  weekNumber?: string;
  status?: 'running' | 'completed';
  stats?: {
    new: number;
    open: number;
    completed: number;
  };
}

export interface DashboardData {
  assignedProjects: DashboardProject[];
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly endpoint = 'client/dashboard';

  constructor(private http: HttpClient) {}

  /**
   * Get dashboard data for client app
   */
  getDashboardData(): Observable<DashboardData> {
    console.log('🚀 DashboardService: Getting client dashboard data');
    const url = `${environment.apiUrl}/${this.endpoint}/data`;
    return this.http.get<DashboardData>(url);
  }

  /**
   * Toggle favorite status for a project
   */
  toggleProjectFavorite(projectId: number): Observable<{ isFavorite: boolean; message: string }> {
    console.log('🔄 DashboardService: Toggling project favorite status:', projectId);
    const url = `${environment.apiUrl}/${this.endpoint}/projects/${projectId}/favorite`;
    return this.http.post<{ isFavorite: boolean; message: string }>(url, {});
  }
}
