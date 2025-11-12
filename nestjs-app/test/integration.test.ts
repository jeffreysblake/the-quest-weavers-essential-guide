import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should create a room, player and object', async () => {
    // Create a room
    const roomResponse = await request(app.getHttpServer())
      .post('/rooms')
      .send({
        name: 'Test Room',
        width: 10,
        height: 10,
      })
      .expect(201);

    expect(roomResponse.body).toBeDefined();
    expect(roomResponse.body.id).toBeDefined();

    // Create a player
    const playerResponse = await request(app.getHttpServer())
      .post('/players')
      .send({
        name: 'Test Player',
        health: 100,
        level: 1,
      })
      .expect(201);

    expect(playerResponse.body).toBeDefined();
    expect(playerResponse.body.id).toBeDefined();

    // Create an object
    const objectResponse = await request(app.getHttpServer())
      .post('/objects')
      .send({
        name: 'Test Object',
        objectType: 'item',
      })
      .expect(201);

    expect(objectResponse.body).toBeDefined();
    expect(objectResponse.body.id).toBeDefined();

    // Verify all entities exist
    const getAllEntities = await request(app.getHttpServer())
      .get('/entities')
      .expect(200);

    expect(getAllEntities.body.length).toBeGreaterThanOrEqual(3);
  });

  afterAll(async () => {
    await app.close();
  });
});
