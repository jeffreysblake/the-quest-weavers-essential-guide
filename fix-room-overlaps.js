const fs = require('fs');
const path = require('path');

const roomsDir = './games/the-clockwork-conspiracy/rooms';

// Fix overlapping rooms by adjusting their positions
const fixes = [
  // FIX 1: Upscale Promenade - move north from Clocktower Square
  {
    file: 'upscale-promenade.json',
    newPosition: { x: 20, y: 10, z: 0 }, // Was (20, 0, 0) - overlapped with Gazette
    reason: 'Overlapped with Gazette Office - moved north'
  },

  // FIX 2: Evidence Room - keep at (20, -40, 0) but reduce size to not overlap
  // Actually, let me move Tavern instead since Evidence Room should be in police station
  {
    file: 'dockside-tavern.json',
    newPosition: { x: 10, y: -40, z: 0 }, // Was (20, -40, 0) - overlapped with Evidence Room
    reason: 'Overlapped with Evidence Room - moved west'
  },

  // FIX 3: Records Hall - move it adjacent to City Hall Entrance
  {
    file: 'records-hall.json',
    newPosition: { x: 10, y: -60, z: 0 }, // Was (20, -60, 0) - overlapped with Docks
    reason: 'Overlapped with Docks - moved west to be near City Hall'
  },

  // FIX 4: Smuggler's Den - adjust Z position to not overlap with warehouse or entrance
  {
    file: 'smugglers-den.json',
    newPosition: { x: 50, y: -60, z: 0 }, // Was (40, -60, -5) - move east and up
    reason: 'Overlapped with Warehouse and Secret Entrance - moved east'
  },

  // FIX 5: Secret Society Entrance - keep underground but not overlapping
  {
    file: 'secret-society-entrance.json',
    newPosition: { x: 40, y: -60, z: -15 }, // Was (40, -60, -10) - move down
    reason: 'Z-overlap with Smuggler Den - moved deeper underground'
  },

  // FIX 6: Ritual Chamber - adjust to connect properly with entrance
  {
    file: 'ritual-chamber.json',
    newPosition: { x: 40, y: -70, z: -15 }, // Was (40, -80, -10) - adjust
    reason: 'Align with Secret Entrance'
  },

  // FIX 7: Secret Basement - adjust Z to not overlap with Factory or Secret Lab
  {
    file: 'secret-basement.json',
    newPosition: { x: 40, y: 10, z: -5 }, // Was (40, 0, -5) - move north to align with Manor
    reason: 'Should be under Manor, not Factory'
  },

  // FIX 8: Steamwright Manor - adjust to be properly above basement
  {
    file: 'steamwright-manor.json',
    newPosition: { x: 40, y: 10, z: 0 }, // Was (40, 0, 5) - move to align with basement
    reason: 'Align with Secret Basement below it'
  },

  // FIX 9: Secret Laboratory - keep deep under factory
  {
    file: 'secret-laboratory.json',
    newPosition: { x: 40, y: 0, z: -15 }, // Was (40, 0, -10) - move deeper
    reason: 'Avoid overlap with other underground rooms'
  }
];

console.log(`Applying ${fixes.length} room position fixes...\n`);

fixes.forEach(fix => {
  const filePath = path.join(roomsDir, fix.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  console.log(`Fixing ${data.name}:`);
  console.log(`  Old position: (${data.position.x}, ${data.position.y}, ${data.position.z})`);
  console.log(`  New position: (${fix.newPosition.x}, ${fix.newPosition.y}, ${fix.newPosition.z})`);
  console.log(`  Reason: ${fix.reason}\n`);

  data.position = fix.newPosition;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
});

console.log('✅ All fixes applied! Run check-room-overlaps.js to verify.');
