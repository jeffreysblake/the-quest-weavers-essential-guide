#!/bin/bash
cd /home/user/the-quest-weavers-essential-guide/nestjs-app/src/game/commands

# Create the trimmed format spec file
head -n 508 dialogue-command.handler.format.spec.ts > dialogue-command.handler.format.spec.ts.tmp

# Add closing brace for the main describe block
echo "});" >> dialogue-command.handler.format.spec.ts.tmp

# Replace the title on line 11
sed -i "11s/Format Conversion & Context/Format Conversion/" dialogue-command.handler.format.spec.ts.tmp

# Replace the original file
mv dialogue-command.handler.format.spec.ts.tmp dialogue-command.handler.format.spec.ts

echo "File splitting complete!"
wc -l dialogue-command.handler.format.spec.ts dialogue-command.handler.context.spec.ts
