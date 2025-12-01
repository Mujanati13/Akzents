const fs = require('fs');
const path = require('path');

// Path to the typeorm.utils.js file
const filePath = path.join(
  __dirname,
  'node_modules/@nestjs/typeorm/dist/common/typeorm.utils.js'
);

try {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if crypto is already imported
    if (!content.includes("require('crypto')") && !content.includes('const crypto')) {
      // Add crypto require after "use strict"
      content = content.replace(
        '"use strict";\nObject.defineProperty',
        '"use strict";\nconst crypto = require("crypto");\nObject.defineProperty'
      );
      
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('✓ Patched @nestjs/typeorm crypto issue');
    }
  }
} catch (error) {
  console.error('Warning: Could not patch typeorm.utils.js:', error.message);
  // Don't fail the build if patching fails
}
