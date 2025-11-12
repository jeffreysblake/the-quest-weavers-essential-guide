import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('System Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should be able to create and retrieve a room', async () => {
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

    // Retrieve the room
    const getRoomResponse = await request(app.getHttpServer())
      .get(`/rooms/${roomResponse.body.id}`)
      .expect(200);

    expect(getRoomResponse.body).toBeDefined();
    expect(getRoomResponse.body.name).toBe('Test Room');
  });

  it('should be able to create and retrieve a player', async () => {
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

    // Retrieve the player
    const getPlayerResponse = await request(app.getHttpServer())
      .get(`/players/${playerResponse.body.id}`)
      .expect(200);

    expect(getPlayerResponse.body).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
