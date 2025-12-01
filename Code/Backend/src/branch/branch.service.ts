import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchRepository } from './infrastructure/persistence/branch.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Branch } from './domain/branch';
import { ClientCompanyService } from '../client-company/client-company.service';
import { ClientCompany } from '../client-company/domain/client-company';
import { CitiesService } from '../cities/cities.service';
import { Cities } from '../cities/domain/cities';

@Injectable()
export class BranchService {
  constructor(
    private readonly branchRepository: BranchRepository,
    @Inject(forwardRef(() => ClientCompanyService))
    private readonly clientService: ClientCompanyService,
    private readonly cityService: CitiesService,
  ) {}

  async create(createBranchDto: CreateBranchDto): Promise<Branch> {
    const client = await this.clientService.findById(createBranchDto.client.id);
    if (!client) {
      throw new Error('Client not found');
    }

    let city: Cities | undefined;

    if (createBranchDto.city?.id) {
      const foundCity = await this.cityService.findById(
        createBranchDto.city.id,
      );
      if (!foundCity) {
      throw new Error('City not found');
      }
      city = foundCity;
    }

    return this.branchRepository.create({
      name: createBranchDto.name,
      branchNumber: createBranchDto.branchNumber,
      street: createBranchDto.street,
      zipCode: createBranchDto.zipCode,
      phone: createBranchDto.phone,
      client,
      city,
    });
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.branchRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: Branch['id']) {
    return this.branchRepository.findById(id);
  }

  findByIds(ids: Branch['id'][]) {
    return this.branchRepository.findByIds(ids);
  }

  findByClientCompanyId(clientCompanyId: number) {
    return this.branchRepository.findByClientCompanyId(clientCompanyId);
  }

  async update(id: Branch['id'], updateBranchDto: UpdateBranchDto) {
    let client: ClientCompany | undefined = undefined;

    if (updateBranchDto.client) {
      const foundClient = await this.clientService.findById(
        updateBranchDto.client.id,
      );
      if (!foundClient) {
        throw new Error('Client not found');
      }
      client = foundClient;
    }

    let city: Cities | undefined = undefined;

    if (updateBranchDto.city) {
      const foundCity = await this.cityService.findById(updateBranchDto.city.id);
      if (!foundCity) {
        throw new Error('City not found');
      }
      city = foundCity;
    }

    return this.branchRepository.update(id, {
      name: updateBranchDto.name,
      branchNumber: updateBranchDto.branchNumber,
      street: updateBranchDto.street,
      zipCode: updateBranchDto.zipCode,
      phone: updateBranchDto.phone,
      client,
      city,
    });
  }

  remove(id: Branch['id']) {
    return this.branchRepository.remove(id);
  }

  async findByNameAndClient(name: string, clientId: number): Promise<Branch | null> {
    return this.branchRepository.findByNameAndClient(name, clientId);
  }

  async findByBranchNumberAndClient(
    branchNumber: string,
    clientId: number,
  ): Promise<Branch | null> {
    return this.branchRepository.findByBranchNumberAndClient(
      branchNumber,
      clientId,
    );
  }

  async findByNameStreetZipCodeCityAndProject(
    name: string,
    street: string | null,
    zipCode: string | null,
    cityId: number,
    projectId: number,
  ): Promise<Branch | null> {
    return this.branchRepository.findByNameStreetZipCodeCityAndProject(
      name,
      street,
      zipCode,
      cityId,
      projectId,
    );
  }
}
