import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface Branch {
  id: number;
  name: string;
  street?: string;
  zipCode?: string;
  phone?: string;
  client: {
    id: number;
    name: string;
  };
  city?: {
    id: number;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class BranchesService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Get branches for a specific client company
   * @param clientCompanyId The ID of the client company
   * @returns Observable of Branch array
   */
  getBranchesByClientCompany(clientCompanyId: number): Observable<Branch[]> {
    const url = `${this.apiUrl}/client-company/${clientCompanyId}/branches`;
    return this.http.get<Branch[]>(url);
  }

  /**
   * Get reports for a specific branch
   * @param branchId The ID of the branch
   * @returns Observable of Report array
   */
  getReportsByBranch(branchId: number): Observable<any[]> {
    const url = `${this.apiUrl}/branch/${branchId}/reports`;
    return this.http.get<any[]>(url);
  }
}
