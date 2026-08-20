require('fs').readFileSync('.env','utf8').split('\n').forEach(line => {
  const [k,...v] = line.split('=');
  if(k && v.length) process.env[k.trim()] = v.join('=').trim();
});
const { sql } = require('../src/lib/db');

(async () => {
  try {
    console.log('--- Checking Tables in DB ---');
    const tables = await sql(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    console.log('Tables:', tables.map(t => t.table_name));

    console.log('--- Testing Block query ---');
    const blocks = await sql(`SELECT 1 FROM "Block" LIMIT 1`);
    console.log('Block ok:', blocks);

    console.log('--- Testing Group queries ---');
    const groups = await sql(`SELECT g.id, g.name FROM "Group" g LIMIT 1`);
    console.log('Group ok:', groups);

    const groupMembers = await sql(`SELECT * FROM "GroupMember" LIMIT 1`);
    console.log('GroupMember ok:', groupMembers);

    const groupMessages = await sql(`SELECT * FROM "GroupMessage" LIMIT 1`);
    console.log('GroupMessage ok:', groupMessages);

  } catch (e) {
    console.error('DATABASE ERROR DETECTED:', e.message);
  }
})();
