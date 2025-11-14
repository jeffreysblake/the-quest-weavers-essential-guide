import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Basic Functionality Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should be able to create a room', async () => {
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

    // Verify we can retrieve it
    const getRoomResponse = await request(app.getHttpServer())
      .get(`/rooms/${roomResponse.body.id}`)
      .expect(200);

    expect(getRoomResponse.body).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
