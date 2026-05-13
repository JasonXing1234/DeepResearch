#!/usr/bin/env python3

import argparse
import os
import sys
import uuid

import boto3
from botocore.config import Config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test Bedrock Agent from command line")
    parser.add_argument("--prompt", required=True, help="Prompt text to send to the agent")
    parser.add_argument("--agent-id", default=os.getenv("BEDROCK_AGENT_ID"), help="Bedrock agent id")
    parser.add_argument(
        "--alias-id",
        default=os.getenv("BEDROCK_AGENT_ALIAS_ID"),
        help="Bedrock agent alias id",
    )
    parser.add_argument(
        "--region",
        default=os.getenv("AWS_REGION", "us-east-1"),
        help="AWS region",
    )
    parser.add_argument(
        "--session-id",
        default=f"py-cli-{str(uuid.uuid4())[:12]}",
        help="Session identifier",
    )
    parser.add_argument("--trace", action="store_true", help="Enable agent trace")
    parser.add_argument(
        "--connect-timeout",
        type=int,
        default=8,
        help="Connect timeout in seconds",
    )
    parser.add_argument(
        "--read-timeout",
        type=int,
        default=45,
        help="Read timeout in seconds",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.agent_id or not args.alias_id:
        print(
            "Missing agent configuration: set BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID or pass --agent-id/--alias-id.",
            file=sys.stderr,
        )
        return 2

    cfg = Config(
        connect_timeout=args.connect_timeout,
        read_timeout=args.read_timeout,
        retries={"max_attempts": 1},
    )

    client = boto3.client("bedrock-agent-runtime", region_name=args.region, config=cfg)

    print(
        {
            "region": args.region,
            "agentId": args.agent_id,
            "agentAliasId": args.alias_id,
            "sessionId": args.session_id,
            "trace": args.trace,
        }
    )

    response = client.invoke_agent(
        agentId=args.agent_id,
        agentAliasId=args.alias_id,
        sessionId=args.session_id,
        inputText=args.prompt,
        enableTrace=args.trace,
    )

    chunks = []
    for event in response.get("completion", []):
        chunk = event.get("chunk")
        if chunk and "bytes" in chunk:
            chunks.append(chunk["bytes"].decode("utf-8", errors="ignore"))
        if args.trace and event.get("trace"):
            trace = event["trace"].get("trace", {})
            trace_type = next(iter(trace.keys()), "unknown") if isinstance(trace, dict) else "unknown"
            print(f"[trace] {trace_type}")

    final_text = "".join(chunks).strip()
    print("\n--- agent response ---\n")
    print(final_text if final_text else "<empty>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
