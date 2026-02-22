pnpm --filter @composable-workflow/workflow-cli run workflow run --type reference.long-running.v1 --input '{"requestId":"req_1","checkpointCount":3}'

pnpm --filter @composable-workflow/workflow-cli run workflow run --type reference.success.v1 --input '{"requestId":"req_1","customerId":"cust_1","amountCents":1000,"currency":"USD"}'

pnpm --filter @composable-workflow/workflow-cli run workflow inspect --type reference.long-running.v1 --graph

pnpm --filter @composable-workflow/workflow-cli run workflow runs list --workflow-type reference.long-running.v1

pnpm --filter @composable-workflow/workflow-cli run workflow runs list

pnpm --filter @composable-workflow/workflow-cli run workflow runs events --run-id wr_01KJ1YZFGQZHRGZBM99BRZWJ5A
