import { Test, TestingModule } from '@nestjs/testing';
import { GisController } from './gis.controller';
import { GisService } from './gis.service';
import { AuditLogService } from '../admin/audit-log.service';

describe('GisController', () => {
  let controller: GisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GisController],
      providers: [
        {
          provide: GisService,
          useValue: {},
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<GisController>(GisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
