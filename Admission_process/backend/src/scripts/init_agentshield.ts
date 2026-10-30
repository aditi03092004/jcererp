import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import sequelize from '../config/database';
import { ensureAgentShieldTables } from '../models/agentshield/migration';
import { rulesService } from '../services/agentshield/rules.service';

async function main() {
  console.log('--- Initializing AgentShield Database Subsystem ---');
  await sequelize.authenticate();
  console.log('✓ Database connection established.');

  await ensureAgentShieldTables(sequelize);
  console.log('✓ AgentShield database tables and indexes verified.');

  await rulesService.seedDefaultRules();
  console.log('✓ Default AgentShield detection rules seeded.');

  const rules = await rulesService.getAllRules();
  console.log(`✓ Active Detection Rules loaded: ${rules.length}`);
  for (const r of rules) {
    console.log(`  - [${r.id}] ${r.name} (${r.category}) -> ${r.riskLevel} / Policy: ${r.responsePolicy}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});

