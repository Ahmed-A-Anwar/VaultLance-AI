const fs = require('fs');
let c = fs.readFileSync('src/components/shared/PayPalAuthorizeButton.tsx', 'utf8');

c = c.replace(
  'const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000";',
  'const rawApi = import.meta.env.VITE_API_URL || "http://localhost:3000/api";\r\n  const apiBase = rawApi.replace(/\\/api$/, "");'
);

fs.writeFileSync('src/components/shared/PayPalAuthorizeButton.tsx', c, 'utf8');
console.log('Fixed apiBase in PayPalAuthorizeButton.tsx');
