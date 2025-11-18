const fs = require('fs');
const path = require('path');

const npcsDir = './games/the-clockwork-conspiracy/npcs';
const roomsDir = './games/the-clockwork-conspiracy/rooms';

// Load all rooms
const rooms = [];
const roomFiles = fs.readdirSync(roomsDir);
roomFiles.forEach(file => {
  if (file.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(path.join(roomsDir, file), 'utf8'));
    rooms.push({
      id: data.id,
      name: data.name,
      position: data.position,
      size: data.size
    });
  }
});

// Load all NPCs
const npcs = [];
const npcFiles = fs.readdirSync(npcsDir);
npcFiles.forEach(file => {
  if (file.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(path.join(npcsDir, file), 'utf8'));
    npcs.push({
      id: data.id,
      name: data.name,
      position: data.position,
      file: file
    });
  }
});

console.log('NPCs that need position updates:\n');

// Rooms that were moved
const movedRooms = [
  { id: 'upscale-promenade', newPos: {x:20, y:10, z:0} },
  { id: 'steamwright-manor', newPos: {x:40, y:10, z:0} },
  { id: 'smugglers-den', newPos: {x:50, y:-60, z:0} },
];

npcs.forEach(npc => {
  if (!npc.position) {
    console.log(`⚠️  ${npc.name} has NO position defined`);
    return;
  }

  // Find which room this NPC should be in
  const inRoom = rooms.find(room => {
    const x = npc.position.x;
    const y = npc.position.y;
    const z = npc.position.z;

    return x >= room.position.x && x < room.position.x + room.size.width &&
           y >= room.position.y && y < room.position.y + room.size.height &&
           z >= room.position.z && z < room.position.z + room.size.depth;
  });

  if (!inRoom) {
    console.log(`❌ ${npc.name} @ (${npc.position.x}, ${npc.position.y}, ${npc.position.z}) - NOT IN ANY ROOM!`);
    console.log(`   File: ${npc.file}`);
  } else {
    console.log(`✓ ${npc.name.padEnd(35)} in ${inRoom.name}`);
  }
});
