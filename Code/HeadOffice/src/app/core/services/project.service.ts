import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@app/core/services/api.service';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly endpoint = 'project';

  constructor(private apiService: ApiService) {}

  createProject(payload: any): Observable<any> {
    return this.apiService.post<any>(this.endpoint, payload);
  }

  /**
   * Toggle favorite status for a project
   */
  toggleFavoriteStatus(projectId: string): Observable<{ isFavorite: boolean; message: string }> {
    return this.apiService.post<{ isFavorite: boolean; message: string }>(`${this.endpoint}/${projectId}/toggle-favorite`, {});
  }
}
