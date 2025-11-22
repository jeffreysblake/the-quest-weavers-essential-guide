const fs = require('fs');
const path = require('path');

const baseDir = '/home/user/the-quest-weavers-essential-guide/nestjs-app/src/game/commands';
const newFile = path.join(baseDir, 'dialogue-command.handler.format.spec.NEW.ts');
const targetFile = path.join(baseDir, 'dialogue-command.handler.format.spec.ts');

try {
  // Read the new file content
  const content = fs.readFileSync(newFile, 'utf8');

  // Write it to the target file (overwriting)
  fs.writeFileSync(targetFile, content, 'utf8');

  // Delete the temporary new file
  fs.unlinkSync(newFile);

  // Delete the shell script
  const shellScript = '/home/user/the-quest-weavers-essential-guide/nestjs-app/fix-format-spec.sh';
  if (fs.existsSync(shellScript)) {
    fs.unlinkSync(shellScript);
  }

  console.log('File split completed successfully!');
  console.log('\nFile sizes:');

  const formatFile = path.join(baseDir, 'dialogue-command.handler.format.spec.ts');
  const contextFile = path.join(baseDir, 'dialogue-command.handler.context.spec.ts');

  const formatLines = fs.readFileSync(formatFile, 'utf8').split('\n').length;
  const contextLines = fs.readFileSync(contextFile, 'utf8').split('\n').length;

  console.log(`dialogue-command.handler.format.spec.ts: ${formatLines} lines`);
  console.log(`dialogue-command.handler.context.spec.ts: ${contextLines} lines`);

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
