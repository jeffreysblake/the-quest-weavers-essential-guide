import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Core Functionality Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should create a room', async () => {
    const response = await request(app.getHttpServer())
      .post('/rooms')
      .send({
        name: 'Test Room',
        width: 10,
        height: 10,
      })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.id).toBeDefined();
    expect(response.body.name).toBe('Test Room');
  });

  it('should create a player', async () => {
    const response = await request(app.getHttpServer())
      .post('/players')
      .send({
        name: 'Test Player',
        health: 100,
        level: 1,
      })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.id).toBeDefined();
    expect(response.body.name).toBe('Test Player');
  });

  it('should create an object', async () => {
    const response = await request(app.getHttpServer())
      .post('/objects')
      .send({
        name: 'Test Object',
        objectType: 'item',
      })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.id).toBeDefined();
    expect(response.body.name).toBe('Test Object');
  });

  afterAll(async () => {
    await app.close();
  });
});
