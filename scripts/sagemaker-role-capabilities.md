# SageMaker Role Capabilities

## Role Identity

```
ARN:  arn:aws:iam::339168331141:role/pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess
STS:  arn:aws:sts::339168331141:assumed-role/pbr-pfm-scientist-cewt-data-scientist-SageMakerAccess/SageMaker
```



## Permission Boundary

**Policy**: `arn:aws:iam::339168331141:policy/PermissionBoundary`


## Confirmed Allowed Actions (live-tested)

| Service | Action | Notes |
|---|---|---|
| S3 | `s3:ListBuckets` | Wide access — sees many org buckets |
| Bedrock | `bedrock:ListFoundationModels` | Full model catalog visible |
| Bedrock Agent | `bedrock-agent:ListAgents` | Allowed (returns empty — no agents exist) |
| Bedrock Agent | `bedrock-agent:ListKnowledgeBases` | Allowed (returns empty) |
| Bedrock Runtime | `bedrock:InvokeModel` | direct model inference |
| CloudWatch Logs | `logs:DescribeLogGroups` | Log group enumeration allowed |

## Confirmed Blocked Actions

| Service | Action | Reason |
|---|---|---|
| Bedrock Agent Runtime | `bedrock:InvokeAgent` | Not in boundary — managed agent orchestration blocked |
| IAM | `iam:ListRolePolicies` | Cannot inspect own role policies |
| IAM | `iam:ListAttachedRolePolicies` | Cannot inspect own attached policies |
| IAM | `iam:GetPolicy` | Cannot read permission boundary policy |
| Secrets Manager | `secretsmanager:ListSecrets` | Blocked |

//node: pulling diff file from s3 and read diff file, feed diff file to FM -> response -> node: generate code
//agentcore

//s3, lambda