import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GisService } from './gis.service';

describe('GisService', () => {
  let service: GisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GisService,
        {
          provide: getDataSourceToken(),
          useValue: {
            query: jest.fn(),
          } satisfies Partial<DataSource>,
        },
      ],
    }).compile();

    service = module.get<GisService>(GisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
