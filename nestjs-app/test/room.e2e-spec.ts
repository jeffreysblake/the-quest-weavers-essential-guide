import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Room (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000); // 30 second timeout for module initialization

  it('/rooms (POST)', () => {
    return request(app.getHttpServer())
      .post('/rooms')
      .send({
        name: 'Test Room',
        width: 10,
        height: 10,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('Test Room');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
