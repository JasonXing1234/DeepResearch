import { NextRequest, NextResponse } from 'next/server';
import { buildResearchRows, ResearchResults, DetailRow, SummaryRow } from '@/lib/research-report';
import { getSnowflakeConnection, executeSnowflakeSql } from '@/lib/snowflake';

// Fully-qualified Snowflake destination tables. Overridable via env vars in
// case the dataset ever needs to land in a different database/schema.
// NOTE: These tables are owned/managed outside this app (pre-existing
// production schema) — column names and types below must match exactly.
const DETAILS_TABLE =
  process.env.SNOWFLAKE_LEADS_DETAILS_TABLE ||
  'WATCHTOWER_ANA_DEV_DB.ELI.AI_LEADS_PROFILES_DETAILS';
const SUMMARY_TABLE =
  process.env.SNOWFLAKE_LEADS_SUMMARY_TABLE ||
  'WATCHTOWER_ANA_DEV_DB.ELI.AI_LEADS_PROFILES_SUMMARY';

const DETAILS_DDL = `
CREATE TABLE IF NOT EXISTS ${DETAILS_TABLE} (
  CUSTOMER   VARCHAR,
  ATTRIBUTE  VARCHAR,
  YES_NO     BOOLEAN,
  TEXT       VARCHAR,
  URL        VARCHAR,
  URL_2      VARCHAR
)`;

const SUMMARY_DDL = `
CREATE TABLE IF NOT EXISTS ${SUMMARY_TABLE} (
  CUSTOMER                            VARCHAR,
  COMMITMENT_TO_REDUCE                BOOLEAN,
  NET_ZERO_TARGET                     BOOLEAN,
  PILOT                               BOOLEAN,
  ANNOUNCE_INVESTMENT                 BOOLEAN,
  EQUIPMENT_PURCHASED                 BOOLEAN,
  ELECTRIFICATION_FAVORABLE_PROJECTS  BOOLEAN,
  COUNTRY                             VARCHAR,
  PROFILE_DATE                        DATE
)`;

function toBool(yesNo: string): boolean {
  return yesNo === 'Yes';
}

function detailBinds(rows: DetailRow[]): unknown[][] {
  return rows.map(r => {
    const [url1, url2] = r.URL ? r.URL.split('; ') : [];
    return [r.Customer, r.Attribute, toBool(r['Yes/No']), r.Text, url1 ?? null, url2 ?? null];
  });
}

function summaryBinds(rows: SummaryRow[]): unknown[][] {
  const profileDate = new Date().toISOString().slice(0, 10);
  return rows.map(r => [
    r.Customer,
    toBool(r['Commitment to Reduce']),
    toBool(r['Net-zero target']),
    toBool(r.Pilot),
    toBool(r['Investment announced']),
    toBool(r['Equipment purchased']),
    toBool(r['Project environment/constraints']),
    r.Country,
    profileDate,
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { results: ResearchResults; truncate?: boolean };
    const { results, truncate = false } = body;

    if (!results) {
      return NextResponse.json({ success: false, error: 'results is required' }, { status: 400 });
    }

    const { detailRows, summaryRows } = buildResearchRows(results);

    const connection = await getSnowflakeConnection();

    await executeSnowflakeSql(connection, DETAILS_DDL);
    await executeSnowflakeSql(connection, SUMMARY_DDL);

    if (truncate) {
      await executeSnowflakeSql(connection, `TRUNCATE TABLE ${DETAILS_TABLE}`);
      await executeSnowflakeSql(connection, `TRUNCATE TABLE ${SUMMARY_TABLE}`);
    }

    if (detailRows.length > 0) {
      await executeSnowflakeSql(
        connection,
        `INSERT INTO ${DETAILS_TABLE} (CUSTOMER, ATTRIBUTE, YES_NO, TEXT, URL, URL_2) VALUES (?, ?, ?, ?, ?, ?)`,
        detailBinds(detailRows)
      );
    }

    if (summaryRows.length > 0) {
      await executeSnowflakeSql(
        connection,
        `INSERT INTO ${SUMMARY_TABLE} (CUSTOMER, COMMITMENT_TO_REDUCE, NET_ZERO_TARGET, PILOT, ANNOUNCE_INVESTMENT, EQUIPMENT_PURCHASED, ELECTRIFICATION_FAVORABLE_PROJECTS, COUNTRY, PROFILE_DATE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        summaryBinds(summaryRows)
      );
    }

    return NextResponse.json({
      success: true,
      detailsInserted: detailRows.length,
      summaryInserted: summaryRows.length,
      detailsTable: DETAILS_TABLE,
      summaryTable: SUMMARY_TABLE,
    });
  } catch (err) {
    console.error('[export-snowflake] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

