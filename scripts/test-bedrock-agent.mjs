#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/test-bedrock-agent.mjs --prompt "What are 3 sustainability risks 
for data centers?"

Optional args:
  --agent-id <id>         Defaults to BEDROCK_AGENT_ID
  --alias-id <id>         Defaults to BEDROCK_AGENT_ALIAS_ID
  --region <region>       Defaults to AWS_REGION or us-east-1
  --session-id <id>       Defaults to br-cli-<random>
  --invoke-timeout-ms <n> Timeout for InvokeAgent request (default: 30000)
  --stream-timeout-ms <n> Timeout waiting for next stream event (default: 30000)
  --trace                 Enable agent trace output
`);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}


async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    usage();
    return;
  }

  const prompt = args.prompt || args.p;
  if (!prompt) {
    console.error('Missing required --prompt argument.');
    usage();
    process.exit(2);
  }

  const agentId = args['agent-id'] || process.env.BEDROCK_AGENT_ID;
  const agentAliasId = args['alias-id'] || process.env.BEDROCK_AGENT_ALIAS_ID;
  const region = args.region || process.env.AWS_REGION || 'us-east-1';
  const sessionId = args['session-id'] || `br-cli-${randomUUID().slice(0, 12)}`;
  const invokeTimeoutMs = parsePositiveInt(args['invoke-timeout-ms'], 30000);
  const streamTimeoutMs = parsePositiveInt(args['stream-timeout-ms'], 30000);
  const enableTrace = args.trace === 'true';

  if (!agentId || !agentAliasId) {
    console.error('Missing agent configuration. Set BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID, or pass --agent-id/--alias-id.');
    process.exit(2);
  }

  const client = new BedrockAgentRuntimeClient({ region });

  console.log(JSON.stringify({
    region,
    agentId,
    agentAliasId,
    sessionId,
    invokeTimeoutMs,
    streamTimeoutMs,
    trace: enableTrace,
  }, null, 2));

  const command = new InvokeAgentCommand({
    agentId,
    agentAliasId,
    sessionId,
    inputText: prompt,
    enableTrace,
  });

  if (enableTrace) {
    console.log(`[trace] sending InvokeAgent request (timeout ${invokeTimeoutMs}ms)`);
  }

  const response = await withTimeout(
    client.send(command),
    invokeTimeoutMs,
    `InvokeAgent request timed out after ${invokeTimeoutMs}ms`
  );

  if (!response.completion) {
    console.error('No completion stream returned from Bedrock Agent Runtime.');
    process.exit(1);
  }

  let finalText = '';
  let chunkCount = 0;
  const streamIterator = response.completion[Symbol.asyncIterator]();

  while (true) {
    const next = await withTimeout(
      streamIterator.next(),
      streamTimeoutMs,
      `Timed out waiting for stream event after ${streamTimeoutMs}ms`
    );

    if (next.done) {
      break;
    }

    const event = next.value;
    if (event.chunk?.bytes) {
      finalText += new TextDecoder().decode(event.chunk.bytes);
      chunkCount += 1;
      if (enableTrace) {
        console.log(`[trace] chunk ${chunkCount} received`);
      }
    }

    if (enableTrace && event.trace) {
      const trace = event.trace.trace;
      const traceType = trace ? Object.keys(trace)[0] : 'unknown';
      console.log(`[trace] ${traceType}`);
    }
  }

  if (!finalText.trim()) {
    console.log('Agent completed without text output.');
    return;
  }

  console.log('\n--- agent response ---\n');
  console.log(finalText.trim());
}

main().catch((error) => {
  console.error('invoke_agent_failed', {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    statusCode: error?.$metadata?.httpStatusCode,
  });
  process.exit(1);
});
