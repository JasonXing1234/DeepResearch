# Bedrock Agent InvokeAgent Permission Diagnostic Guide

## Problem
User running as `arn:aws:sts::339168331141:assumed-role/pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess/SageMaker` receives:

```
AccessDeniedException: User is not authorized to perform bedrock:InvokeAgent on resource 
arn:aws:bedrock:us-east-1:339168331141:agent-alias/TUFE5WHEOZ/C28X9B4PG9
```

## For AWS Admin / IAM Team

### Step 1: Check Role Policies (Run as admin/role owner)

```bash
# Get role inline policies
aws iam list-role-policies --role-name pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess

# Get role attached managed policies
aws iam list-attached-role-policies --role-name pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess

# For each managed policy, get the version
# Example:
aws iam get-policy-version --policy-arn <policy-arn> --version-id <version-id>
```

### Step 2: Check for Permission Boundary

```bash
aws iam get-role --role-name pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess

# Look for "PermissionsBoundary" in output. If present:
aws iam get-policy --policy-arn <boundary-arn>
aws iam get-policy-version --policy-arn <boundary-arn> --version-id <version-id>
```

### Step 3: Check for SCPs

```bash
# List all SCPs in the organization
aws organizations list-policies --filter SERVICE_CONTROL_POLICY

# For each SCP, get details:
aws organizations describe-policy --policy-id <policy-id>
```

### Step 4: Simulate the Policy (Run as admin)

```bash
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::339168331141:role/pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess \
  --action-names bedrock:InvokeAgent \
  --resource-arns arn:aws:bedrock:us-east-1:339168331141:agent-alias/TUFE5WHEOZ/C28X9B4PG9
```

Expected output if allowed: `"EvalDecision": "allowed"`

### Step 5: Check Resource-Based Policies

```bash
# Check if the agent has a resource policy (rare but possible)
aws bedrock list-agents-for-bedrock-console
aws bedrock get-agent --agent-id TUFE5WHEOZ

# Check agent alias config
aws bedrock-agent list-agent-aliases --agent-id TUFE5WHEOZ
aws bedrock-agent get-agent-alias --agent-id TUFE5WHEOZ --agent-alias-id C28X9B4PG9
```

---

## Likely Root Cause Checklist

- [ ] **Inline policy missing bedrock:InvokeAgent Allow** → Add to role inline policy
- [ ] **Attached policy missing bedrock:InvokeAgent** → Update managed policy or attach new one
- [ ] **Permission boundary blocks bedrock:InvokeAgent** → Update boundary or create exemption
- [ ] **SCP explicitly denies bedrock:InvokeAgent** → Request SCP exception
- [ ] **SCP condition (e.g., tags) blocks bedrock:InvokeAgent** → Add principal tags or request exception
- [ ] **Resource policy on agent denies access** → Update agent resource policy

---

## Recommended Minimum Allow Policy

Add this inline or managed policy to the role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowBedrockAgentInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeAgent"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1:339168331141:agent-alias/TUFE5WHEOZ/C28X9B4PG9"
      ]
    }
  ]
}
```

Or broader (all agents in account/region):

```json
{
  "Sid": "AllowAllBedrockAgents",
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeAgent"
  ],
  "Resource": [
    "arn:aws:bedrock:us-east-1:339168331141:agent-alias/*/*"
  ]
}
```

---

## Test Command After Permission Grant

Once policy is updated, re-run in SageMaker:

```bash
cd ~/DeepResearch
export HTTP_PROXY=http://proxy.cat.com:80
export HTTPS_PROXY=http://proxy.cat.com:80
export NO_PROXY=169.254.169.254,169.254.170.2,localhost,127.0.0.1
set -a && source .env.local && set +a

python scripts/test-bedrock-agent.py --prompt "Test prompt" --trace
```

Expected: Agent response or trace output (not AccessDeniedException).
