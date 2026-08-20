require('fs').readFileSync('.env','utf8').split('\n').forEach(line => {
  const [k,...v] = line.split('=');
  if(k && v.length) process.env[k.trim()] = v.join('=').trim();
});
const { sql } = require('../src/lib/db');

(async () => {
  try {
    const cols = await sql(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name IN ('User', 'Friendship', 'Block', 'Group', 'GroupMember', 'GroupMessage')
      ORDER BY table_name, column_name
    `);
    console.log('Columns:', JSON.stringify(cols, null, 2));
  } catch (e) {
    console.error('Err:', e);
  }
})();
