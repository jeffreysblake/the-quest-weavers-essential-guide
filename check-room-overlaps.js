const fs = require('fs');
const path = require('path');

const roomsDir = './games/the-clockwork-conspiracy/rooms';
const rooms = [];

// Read all room files
const files = fs.readdirSync(roomsDir);
files.forEach(file => {
  if (file.endsWith('.json')) {
    const data = JSON.parse(fs.readFileSync(path.join(roomsDir, file), 'utf8'));
    rooms.push({
      id: data.id,
      name: data.name,
      position: data.position,
      size: data.size,
      file: file
    });
  }
});

console.log(`Loaded ${rooms.length} rooms\n`);

// Check for overlaps
const overlaps = [];
for (let i = 0; i < rooms.length; i++) {
  for (let j = i + 1; j < rooms.length; j++) {
    const r1 = rooms[i];
    const r2 = rooms[j];

    // Check if rooms overlap
    const x1Min = r1.position.x;
    const x1Max = r1.position.x + r1.size.width;
    const y1Min = r1.position.y;
    const y1Max = r1.position.y + r1.size.height;
    const z1Min = r1.position.z;
    const z1Max = r1.position.z + r1.size.depth;

    const x2Min = r2.position.x;
    const x2Max = r2.position.x + r2.size.width;
    const y2Min = r2.position.y;
    const y2Max = r2.position.y + r2.size.height;
    const z2Min = r2.position.z;
    const z2Max = r2.position.z + r2.size.depth;

    const xOverlap = x1Min < x2Max && x1Max > x2Min;
    const yOverlap = y1Min < y2Max && y1Max > y2Min;
    const zOverlap = z1Min < z2Max && z1Max > z2Min;

    if (xOverlap && yOverlap && zOverlap) {
      overlaps.push({r1, r2});
      console.log(`❌ OVERLAP FOUND:`);
      console.log(`  ${r1.name} (${r1.id}) at (${r1.position.x}, ${r1.position.y}, ${r1.position.z}) size ${r1.size.width}x${r1.size.height}x${r1.size.depth}`);
      console.log(`  ${r2.name} (${r2.id}) at (${r2.position.x}, ${r2.position.y}, ${r2.position.z}) size ${r2.size.width}x${r2.size.height}x${r2.size.depth}`);
      console.log('');
    }
  }
}

if (overlaps.length === 0) {
  console.log('✅ No overlapping rooms found!');
} else {
  console.log(`\n❌ Found ${overlaps.length} overlapping room pairs`);
}

// List all rooms with their positions
console.log('\n=== All Rooms ===');
rooms.sort((a, b) => {
  if (a.position.x !== b.position.x) return a.position.x - b.position.x;
  if (a.position.y !== b.position.y) return a.position.y - b.position.y;
  return a.position.z - b.position.z;
});

rooms.forEach(r => {
  console.log(`${r.name.padEnd(40)} @ (${r.position.x}, ${r.position.y}, ${r.position.z}) size ${r.size.width}x${r.size.height}x${r.size.depth}`);
});
