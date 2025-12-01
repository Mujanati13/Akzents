import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '@app/core/services/api.service';

export interface User {
  id: number;
  email: string;
  provider: string;
  socialId: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  type: {
    id: number;
    name: string;
    __entity: string;
  };
  role: {
    id: number;
    name: string;
    __entity: string;
  };
  status: {
    id: number;
    name: string;
    __entity: string;
  };
  favoriteClientCompanies?: ClientCompany[];
  clientCompanies?: ClientCompany[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface UserListResponse {
  data: User[];
  hasNextPage: boolean;
  totalCount?: number;
}

export interface UserQueryParams {
  page?: number;
  limit?: number;
  filters?: {
    userTypeNames?: string[];
    search?: string;
    roles?: { id: number }[];
  };
  sort?: {
    orderBy: keyof User;
    order: 'ASC' | 'DESC';
  }[];
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  gender?: string;
  password?: string;
  favoriteClientCompanies?: { id: number }[];
  clientCompanies?: { id: number }[];
}

export interface ClientCompany {
  id: number;
  name: string;
  logo?: {
    path: string;
  };
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly endpoint = 'users';

  constructor(private apiService: ApiService) {}

  /**
   * Get users with pagination and filters
   */
  getUsers(params: UserQueryParams = {}): Observable<UserListResponse> {
    const queryParams: any = {};

    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.limit = params.limit;
    if (params.filters) queryParams.filters = JSON.stringify(params.filters);
    if (params.sort) queryParams.sort = JSON.stringify(params.sort);

    return this.apiService.get<UserListResponse>(this.endpoint, queryParams);
  }

  /**
   * Get user by ID
   */
  getUserById(id: string | number): Observable<User> {
    return this.apiService.get<User>(`${this.endpoint}/${id}`);
  }

  /**
   * Update user by ID
   */
  updateUser(id: string | number, data: UpdateUserDto): Observable<User> {
    console.log('🚀 UsersService: Updating user:', { id, data });
    return this.apiService.patch<User>(`${this.endpoint}/${id}`, data);
  }

  /**
   * Delete user by ID
   */
  deleteUser(id: string | number): Observable<void> {
    return this.apiService.delete<void>(`${this.endpoint}/${id}`);
  }

  /**
   * Get Akzente users (users with type 'akzente' or 'client')
   */
  getAkzenteUsers(params: UserQueryParams = {}): Observable<UserListResponse> {
    const queryParams: any = {};

    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.limit = params.limit;
    if (params.filters) queryParams.filters = JSON.stringify(params.filters);
    if (params.sort) queryParams.sort = JSON.stringify(params.sort);

    return this.apiService.get<UserListResponse>(`${this.endpoint}/akzente`, queryParams);
  }
}
