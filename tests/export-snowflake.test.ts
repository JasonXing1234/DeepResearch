/**
 * Integration test for the "green button" flow in SimpleResearchView:
 * once a user's research batch finishes, the UI automatically POSTs the
 * accumulated results to /api/export-snowflake (see handleExportSnowflake /
 * handleResearch in src/components/SimpleResearchView.tsx). This test
 * reproduces that same request against a running dev server and verifies
 * the rows are actually persisted in the Snowflake *_TEST tables (not just
 * that the API returned success).
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import type { ResearchResults } from '../src/lib/research-report';
import { getSnowflakeConnection, executeSnowflakeSql } from '../src/lib/snowflake';

// Load .env.local (Next.js loads this automatically for the dev server, but
// this test process also needs the Snowflake credentials to verify rows).
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}
loadEnvLocal();

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DETAILS_TABLE = 'WATCHTOWER_ANA_DEV_DB.ELI.AI_LEADS_PROFILES_DETAILS_TEST';
const SUMMARY_TABLE = 'WATCHTOWER_ANA_DEV_DB.ELI.AI_LEADS_PROFILES_SUMMARY_TEST';

// Unique per test run so we can prove these exact rows were freshly written,
// not left over from a previous run.
const TEST_COMPANY = `Jest Test Co ${Date.now()}`;

function buildFinishedBatchResults(): ResearchResults {
  // Shape mirrors what handleResearch() accumulates once every company in
  // the batch has finished processing.
  return {
    emissions: [{
      Company: TEST_COMPANY,
      Country: 'USA',
      'Emissions Reduction Target': '30% by 2030',
      'Net-Zero Target': true,
      Comments: 'Committed to net-zero by 2050',
      Source: 'https://example.com/emissions',
    }],
    investments: [{
      Company: TEST_COMPANY,
      Country: 'USA',
      'Investment Type': 'Electrification',
      Description: 'Invested in electric fleet',
      Source: 'https://example.com/investment',
    }],
    purchases: [],
    pilots: [],
    environments: [],
  };
}

describe('Research batch completion syncs results to Snowflake', () => {
  let detailsInserted = 0;
  let summaryInserted = 0;

  afterAll(async () => {
    // Clean up the rows this test created so the *_TEST tables don't
    // accumulate junk across runs.
    try {
      const connection = await getSnowflakeConnection();
      await executeSnowflakeSql(connection, `DELETE FROM ${DETAILS_TABLE} WHERE CUSTOMER = ?`, [[TEST_COMPANY]]);
      await executeSnowflakeSql(connection, `DELETE FROM ${SUMMARY_TABLE} WHERE CUSTOMER = ?`, [[TEST_COMPANY]]);
    } catch (err) {
      console.warn('[cleanup] failed to delete test rows:', err);
    }
  }, 30000);

  it('posts the finished batch to /api/export-snowflake like the auto-sync does', async () => {
    const results = buildFinishedBatchResults();

    const response = await fetch(`${API_BASE_URL}/api/export-snowflake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    });

    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.detailsInserted).toBeGreaterThan(0);
    expect(data.summaryInserted).toBeGreaterThan(0);
    expect(data.detailsTable).toBe(DETAILS_TABLE);
    expect(data.summaryTable).toBe(SUMMARY_TABLE);

    detailsInserted = data.detailsInserted;
    summaryInserted = data.summaryInserted;
  }, 30000);

  it('persists the detail rows in AI_LEADS_PROFILES_DETAILS_TEST', async () => {
    const connection = await getSnowflakeConnection();
    const rows = await executeSnowflakeSql(
      connection,
      `SELECT CUSTOMER, ATTRIBUTE, YES_NO, TEXT FROM ${DETAILS_TABLE} WHERE CUSTOMER = ? ORDER BY ATTRIBUTE`,
      [[TEST_COMPANY]]
    ) as Array<{ CUSTOMER: string; ATTRIBUTE: string; YES_NO: boolean; TEXT: string }>;

    expect(rows.length).toBe(detailsInserted);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.CUSTOMER === TEST_COMPANY)).toBe(true);

    const netZeroRow = rows.find(r => r.ATTRIBUTE === 'Net-zero target');
    expect(netZeroRow).toBeDefined();
    expect(String(netZeroRow?.YES_NO)).toBe('true');
  }, 30000);

  it('persists the summary row in AI_LEADS_PROFILES_SUMMARY_TEST', async () => {
    const connection = await getSnowflakeConnection();
    const rows = await executeSnowflakeSql(
      connection,
      `SELECT CUSTOMER, NET_ZERO_TARGET, ANNOUNCE_INVESTMENT, COUNTRY, PROFILE_DATE FROM ${SUMMARY_TABLE} WHERE CUSTOMER = ?`,
      [[TEST_COMPANY]]
    ) as Array<{ CUSTOMER: string; NET_ZERO_TARGET: boolean; ANNOUNCE_INVESTMENT: boolean; COUNTRY: string; PROFILE_DATE: string }>;

    expect(rows.length).toBe(summaryInserted);
    expect(rows.length).toBe(1);
    expect(rows[0].CUSTOMER).toBe(TEST_COMPANY);
    expect(String(rows[0].NET_ZERO_TARGET)).toBe('true');
    expect(String(rows[0].ANNOUNCE_INVESTMENT)).toBe('true');
    expect(rows[0].COUNTRY).toBe('USA');
  }, 30000);
});
