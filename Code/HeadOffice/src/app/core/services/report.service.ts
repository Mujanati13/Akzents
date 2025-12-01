import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@app/core/services/api.service';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly endpoint = 'report';

  constructor(private apiService: ApiService) {}

  createReport(payload: any): Observable<any> {
    return this.apiService.post<any>(this.endpoint, payload);
  }

  // Bulk insert reports for a report
  bulkInsertReports(projectId: string | number, data: any[]): Observable<any> {
    const url = `${this.endpoint}/bulkinsert/${projectId}`;
    return this.apiService.post<any>(url, data);
  }

  // Fetch reports for a project
  getReportsByProject(projectId: string | number): Observable<any[]> {
    return this.apiService.get<any[]>(`${this.endpoint}/project/${projectId}`);
  }

  // Fetch a single report by its ID
  getReportById(reportId: string | number): Observable<any> {
    return this.apiService.get<any>(`${this.endpoint}/${reportId}`);
  }

  // Export project reports as Excel file
  exportProjectReportsAsExcel(projectId: string | number, status?: string): Observable<Blob> {
    const url = status ? `${this.endpoint}/project/${projectId}/export-excel?status=${status}` : `${this.endpoint}/project/${projectId}/export-excel`;
    return this.apiService.getBlob(url);
  }

  // Export single report as Excel file
  exportSingleReportAsExcel(reportId: string | number): Observable<Blob> {
    return this.apiService.getBlob(`${this.endpoint}/${reportId}/export-excel`);
  }

  // Update a report by its ID
  updateReport(reportId: string | number, payload: any): Observable<any> {
    return this.apiService.patch<any>(`${this.endpoint}/${reportId}`, payload);
  }

  // Update a report with FormData (for merchandiser change or other simple updates)
  updateReportWithFormData(reportId: string | number, formData: FormData): Observable<any> {
    return this.apiService.patchFile<any>(`${this.endpoint}/${reportId}`, formData, false, false);
  }

  // Update a report with files as FormData
  updateReportWithFiles(reportId: string | number, payload: any, files: any[]): Observable<any> {
    const formData = new FormData();

    // Add JSON payload as a string
    formData.append('data', JSON.stringify(payload));

    // Add files to delete if any
    if (payload.filesToDelete && payload.filesToDelete.length > 0) {
      formData.append('filesToDelete', JSON.stringify(payload.filesToDelete));
    }

    // Add files to FormData
    if (files && files.length > 0) {
      files.forEach((fileData, index) => {
        if (fileData.file) {
          formData.append(`files`, fileData.file);
          formData.append(`fileLabels`, fileData.label || `file_${index}`);
          formData.append(`advancedPhotoIds`, fileData.advancedPhotoId?.toString() || '');
          formData.append(`beforeAfterTypes`, fileData.beforeAfterType ?? '');
          formData.append(`fileOrders`, fileData.order !== undefined ? fileData.order.toString() : index.toString());
        }
      });
    }

    console.log('FormData contents for report update:');
    formData.forEach((value, key) => {
      if (value instanceof File) {
        console.log(`  ${key}: [File] ${value.name} (${value.size} bytes, ${value.type})`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

    return this.apiService.patchFile<any>(`${this.endpoint}/${reportId}`, formData, false, false);
  }

  // Send a message in the report conversation
  sendMessage(reportId: string | number, payload: { content: string; receiverType: string }): Observable<any> {
    // Sanitize reportId to remove any query parameters or extra characters
    const cleanReportId = String(reportId).split('?')[0].split('/')[0].trim();
    return this.apiService.post<any>(`${this.endpoint}/${cleanReportId}/send-message`, payload);
  }

  // Toggle favorite status for a report
  toggleFavoriteStatus(reportId: number): Observable<{ isFavorite: boolean; message: string }> {
    return this.apiService.post<{ isFavorite: boolean; message: string }>(`${this.endpoint}/${reportId}/toggle-favorite`, {});
  }

  // Update report status
  closeReport(reportId: string | number): Observable<any> {
    return this.apiService.patch<any>(`${this.endpoint}/${reportId}/close`);
  }
}
