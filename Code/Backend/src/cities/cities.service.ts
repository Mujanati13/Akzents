import { CountriesService } from '../countries/countries.service';
import { Countries } from '../countries/domain/countries';

import {
  forwardRef,
  HttpStatus,
  Inject,
  UnprocessableEntityException,
} from '@nestjs/common';

import { Injectable } from '@nestjs/common';
import { CreateCitiesDto } from './dto/create-cities.dto';
import { UpdateCitiesDto } from './dto/update-cities.dto';
import { CitiesRepository } from './infrastructure/persistence/cities.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Cities } from './domain/cities';

@Injectable()
export class CitiesService {
  constructor(
    @Inject(forwardRef(() => CountriesService))
    private readonly countriesService: CountriesService,
    private readonly citiesRepository: CitiesRepository,
  ) {}

  async create(createCitiesDto: CreateCitiesDto) {
    const countryObject = await this.countriesService.findById(
      createCitiesDto.country.id,
    );
    if (!countryObject) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          country: 'notExists',
        },
      });
    }
    const country = countryObject;

    return this.citiesRepository.create({
      ...createCitiesDto,
      country,
    });
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.citiesRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: Cities['id']) {
    return this.citiesRepository.findById(id);
  }

  findByIds(ids: Cities['id'][]) {
    return this.citiesRepository.findByIds(ids);
  }

  async findByCountryId(countryId: number): Promise<Cities[]> {
    return this.citiesRepository.findByCountryId(countryId);
  }

  async findByName(name: string) {
    return this.citiesRepository.findByName(name);
  }

  async update(
    id: Cities['id'],
    updateCitiesDto: UpdateCitiesDto,
  ) {
    let country: Countries | undefined = undefined;

    if (updateCitiesDto.country) {
      const countryObject = await this.countriesService.findById(
        updateCitiesDto.country.id,
      );
      if (!countryObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            country: 'notExists',
          },
        });
      }
      country = countryObject;
    }

    return this.citiesRepository.update(id, {
      name: updateCitiesDto.name,
      country,
    });
  }

  remove(id: Cities['id']) {
    return this.citiesRepository.remove(id);
  }
}